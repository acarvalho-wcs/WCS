const RADIO_GARDEN_API = 'https://radio.garden/api';
const RADIO_BROWSER_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
];

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'public, max-age=300, stale-while-revalidate=900' : 'no-store'
  }
});

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function idFromListenUrl(value = '') {
  const match = String(value).match(/radio\.garden\/(?:listen\/[^/]+|api\/ara\/content\/listen)\/([A-Za-z0-9_-]{6,})/i);
  return match?.[1] || null;
}

function scoreRadioBrowserStation(station, name, city) {
  const wantedName = normalize(name);
  const wantedCity = normalize(city);
  const stationName = normalize(station?.name);
  const stationState = normalize(station?.state);
  const homepage = normalize(station?.homepage);
  let score = 0;
  if (stationName === wantedName) score += 12;
  else if (stationName.includes(wantedName) || wantedName.includes(stationName)) score += 8;
  const wantedTokens = wantedName.split(' ').filter((token) => token.length > 2);
  score += wantedTokens.filter((token) => stationName.includes(token)).length * 2;
  if (wantedCity && (stationName.includes(wantedCity) || homepage.includes(wantedCity))) score += 3;
  if (stationState.includes('amazonas')) score += 3;
  if (station?.countrycode === 'BR') score += 2;
  if (station?.lastcheckok) score += 4;
  if (String(station?.url_resolved || station?.url || '').startsWith('https://')) score += 3;
  score += Math.min(Number(station?.clickcount || 0) / 25, 2);
  return score;
}

async function searchRadioBrowser(name, city) {
  const queries = [name, [name, city].filter(Boolean).join(' ')].filter(Boolean);
  const results = [];
  for (const server of RADIO_BROWSER_SERVERS) {
    for (const query of queries) {
      const params = new URLSearchParams({
        name: query,
        countrycode: 'BR',
        hidebroken: 'true',
        order: 'clickcount',
        reverse: 'true',
        limit: '30'
      });
      try {
        const response = await fetch(`${server}/json/stations/search?${params}`, {
          headers: { accept: 'application/json', 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.6.9.4' },
          signal: AbortSignal.timeout(5500)
        });
        if (!response.ok) continue;
        const stations = await response.json();
        for (const station of stations || []) {
          const streamUrl = station?.url_resolved || station?.url;
          if (!streamUrl || !station?.lastcheckok) continue;
          results.push({
            provider: 'Radio Browser',
            station_uuid: station.stationuuid || null,
            name: station.name || name,
            stream_url: streamUrl,
            homepage: station.homepage || '',
            codec: station.codec || '',
            bitrate: station.bitrate || null,
            last_check: station.lastcheckoktime_iso8601 || station.lastchecktime_iso8601 || null,
            score: scoreRadioBrowserStation(station, name, city)
          });
        }
      } catch {}
    }
    if (results.length) break;
  }
  const unique = new Map();
  for (const item of results.sort((a, b) => b.score - a.score)) {
    const key = item.stream_url;
    if (!unique.has(key)) unique.set(key, item);
  }
  const ordered = [...unique.values()];
  // HTTPS first to avoid mixed-content blocking inside the HTTPS observatory.
  ordered.sort((a, b) => {
    const ah = a.stream_url.startsWith('https://') ? 1 : 0;
    const bh = b.stream_url.startsWith('https://') ? 1 : 0;
    return (bh - ah) || (b.score - a.score);
  });
  return ordered.slice(0, 5);
}

async function searchGardenChannelId(name, city) {
  const query = [name, city].filter(Boolean).join(' ');
  if (!query) return null;
  try {
    const response = await fetch(`${RADIO_GARDEN_API}/search?q=${encodeURIComponent(query)}`, {
      headers: { accept: 'application/json', 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.6.9.4' },
      signal: AbortSignal.timeout(4500)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const hits = payload?.hits?.hits || [];
    const wantedName = normalize(name);
    const wantedCity = normalize(city);
    const candidates = hits
      .map((hit) => hit?._source)
      .filter((source) => source?.type === 'channel' && source?.url)
      .map((source) => ({
        source,
        nameScore: normalize(source.title) === wantedName ? 3 : normalize(source.title).includes(wantedName) || wantedName.includes(normalize(source.title)) ? 2 : 0,
        cityScore: wantedCity && normalize(source.subtitle).includes(wantedCity) ? 1 : 0
      }))
      .sort((a, b) => (b.nameScore + b.cityScore) - (a.nameScore + a.cityScore));
    const best = candidates[0]?.source;
    return best ? idFromListenUrl(`https://radio.garden${best.url}`) : null;
  } catch { return null; }
}

async function resolveGardenStream(channelId) {
  const endpoint = `${RADIO_GARDEN_API}/ara/content/listen/${encodeURIComponent(channelId)}/channel.mp3`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET', redirect: 'manual',
      headers: { 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.6.9.4' },
      signal: AbortSignal.timeout(4500)
    });
    const location = response.headers.get('location');
    const streamUrl = location || (response.ok && response.url !== endpoint ? response.url : endpoint);
    return { provider: 'Radio Garden', channel_id: channelId, name: '', stream_url: streamUrl, homepage: '', codec: 'MP3', bitrate: null, last_check: null, score: 0 };
  } catch { return null; }
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const sourceUrl = url.searchParams.get('url') || '';
    const name = (url.searchParams.get('name') || '').slice(0, 160);
    const city = (url.searchParams.get('city') || '').slice(0, 100);

    const streams = await searchRadioBrowser(name, city);

    let channelId = idFromListenUrl(sourceUrl);
    if (!channelId) channelId = await searchGardenChannelId(name, city);
    if (channelId) {
      const garden = await resolveGardenStream(channelId);
      if (garden && !streams.some((item) => item.stream_url === garden.stream_url)) streams.push(garden);
    }

    if (!streams.length) return json(404, { error: 'radio_stream_not_found' });

    return json(200, {
      stream_url: streams[0].stream_url,
      streams,
      provider: streams[0].provider,
      station_name: streams[0].name || name,
      homepage: streams[0].homepage || sourceUrl || '',
      note: 'Resolver prioritizes Radio Browser stations marked online, with Radio Garden as fallback.'
    });
  } catch (error) {
    return json(502, { error: 'radio_stream_unavailable', message: error.message });
  }
};

export const config = { path: '/api/radio-stream' };
