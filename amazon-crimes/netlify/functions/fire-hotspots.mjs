const INDEX_URL = 'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/';
const SOURCE_PAGE = 'https://terrabrasilis.dpi.inpe.br/queimadas/portal/pages/secao_downloads/dados-abertos/index.html';
const MAX_FILES = 36; // approximately 6 hours at the official 10-minute cadence
const MAX_FEATURES = 5000;

const json = (statusCode, body) => new Response(JSON.stringify(body), {
  status: statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300, stale-while-revalidate=600'
  }
});

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  if (!headers.includes('Latitude') && !headers.includes('latitude')) return [];
  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ''])));
}

function first(record, ...keys) {
  for (const key of keys) if (record[key] !== undefined && record[key] !== '') return record[key];
  return '';
}

function normalizeDate(value) {
  if (!value) return null;
  const candidate = value.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const date = new Date(candidate.endsWith('Z') ? candidate : `${candidate}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function numericOrNull(value, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === -999 || n < min || n > max) return null;
  return n;
}

export default async () => {
  try {
    const indexResponse = await fetch(INDEX_URL, { headers: { 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.6.4' } });
    if (!indexResponse.ok) throw new Error(`INPE index HTTP ${indexResponse.status}`);
    const html = await indexResponse.text();
    const names = [...html.matchAll(/href=["'](focos_10min_\d{8}_\d{4}\.csv)["']/gi)].map((m) => m[1]);
    const latest = [...new Set(names)].sort().slice(-MAX_FILES);
    if (!latest.length) throw new Error('No 10-minute CSV files found in INPE directory');

    const csvResponses = await Promise.all(latest.map(async (name) => {
      const response = await fetch(`${INDEX_URL}${name}`, { headers: { 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.6.4' } });
      if (!response.ok) return { name, rows: [] };
      return { name, rows: parseCsv(await response.text()) };
    }));

    const seen = new Set();
    const features = [];
    // Newest files first so a high-volume window never truncates the most recent detections.
    for (const file of [...csvResponses].reverse()) {
      for (const record of file.rows) {
        const biome = String(first(record, 'Bioma', 'bioma')).trim();
        const country = String(first(record, 'Pais', 'País', 'pais')).trim();
        if (country && !/^brasil$/i.test(country)) continue;
        if (!/^amaz[oô]nia$/i.test(biome)) continue;
        const lat = Number(first(record, 'Latitude', 'latitude', 'lat'));
        const lon = Number(first(record, 'Longitude', 'longitude', 'lon'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const detectedAt = normalizeDate(first(record, 'DataHora', 'data_hora', 'datahora'));
        const satellite = first(record, 'Satelite', 'Satélite', 'satelite');
        const key = `${detectedAt}|${lat.toFixed(4)}|${lon.toFixed(4)}|${satellite}`;
        if (seen.has(key)) continue;
        seen.add(key);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: {
            id: key,
            source_kind: 'fire_hotspot',
            detected_at: detectedAt,
            satellite,
            country: country || 'Brasil',
            state: first(record, 'Estado', 'estado'),
            municipality: first(record, 'Municipio', 'Município', 'municipio'),
            biome: biome || 'Amazônia',
            days_without_rain: numericOrNull(first(record, 'DiaSemChuva', 'diasemchuva'), { min: 0 }),
            precipitation_mm: numericOrNull(first(record, 'Precipitacao', 'Precipitação', 'precipitacao'), { min: 0 }),
            fire_risk: numericOrNull(first(record, 'RiscoFogo', 'riscofogo'), { min: 0, max: 1 }),
            frp_mw: numericOrNull(first(record, 'FRP', 'frp'), { min: 0 }),
            source_file: file.name,
            source_name: 'INPE Programa Queimadas / BDQueimadas',
            source_url: SOURCE_PAGE
          }
        });
        if (features.length >= MAX_FEATURES) break;
      }
      if (features.length >= MAX_FEATURES) break;
    }

    features.sort((a, b) => String(b.properties.detected_at).localeCompare(String(a.properties.detected_at)));
    return json(200, {
      type: 'FeatureCollection',
      source: 'INPE Programa Queimadas / BDQueimadas',
      source_url: SOURCE_PAGE,
      cadence: 'near-real-time (~10 min source files)',
      scope: 'Bioma Amazônia, Brasil',
      generated_at: new Date().toISOString(),
      source_file_count: latest.length,
      newest_source_file: latest.at(-1) || null,
      oldest_source_file: latest[0] || null,
      last_detected_at: features[0]?.properties?.detected_at || null,
      feature_count: features.length,
      truncated: features.length >= MAX_FEATURES,
      features
    });
  } catch (error) {
    return json(502, { error: 'fire_hotspots_unavailable', message: error.message, source_url: SOURCE_PAGE });
  }
};

export const config = { path: '/api/fire-hotspots' };
