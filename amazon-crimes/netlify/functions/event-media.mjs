import { getEvent } from './event-store.mjs';

function json(status, body, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': status === 200 ? 'public, max-age=900, stale-while-revalidate=3600' : 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  });
}

function unescapeHtml(value = '') {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function normalizeUrl(value, base) {
  try {
    const url = new URL(unescapeHtml(value), base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function sourceHosts(event) {
  const hosts = new Set();
  for (const source of event?.sources || []) {
    try { hosts.add(new URL(source.url).hostname.toLowerCase()); } catch {}
  }
  for (const media of event?.source_media || []) {
    try { hosts.add(new URL(media.url).hostname.toLowerCase()); } catch {}
  }
  return hosts;
}

function hostAllowed(hostname, allowed) {
  const host = String(hostname || '').toLowerCase();
  if (allowed.has(host)) return true;
  for (const sourceHost of allowed) {
    if (host.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${host}`)) return true;
  }
  return false;
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] || null;
}

function looksLikeContentImage(url) {
  const s = String(url || '').toLowerCase();
  if (!s) return false;
  const blocked = ['logo', 'favicon', 'sprite', 'matomo', 'avatar', 'icon-', 'govbr-logo', 'banner-governo'];
  if (blocked.some((token) => s.includes(token))) return false;
  return /\.(?:jpe?g|png|webp|gif)(?:$|[?#/])/i.test(s) || s.includes('/@@images/');
}

function extractImageCandidates(html, baseUrl, allowedHosts) {
  const candidates = [];
  const push = (raw, priority = 10) => {
    const url = normalizeUrl(raw, baseUrl);
    if (!url) return;
    const parsed = new URL(url);
    if (!hostAllowed(parsed.hostname, allowedHosts)) return;
    if (!looksLikeContentImage(url)) return;
    candidates.push({ url, priority });
  };

  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    if (!['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) continue;
    push(attr(tag, 'content'), 100);
  }

  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-original');
    push(src, String(src || '').includes('/@@images/') ? 90 : 50);
    const srcset = attr(tag, 'srcset');
    if (srcset) {
      for (const part of srcset.split(',')) push(part.trim().split(/\s+/)[0], 55);
    }
  }

  for (const match of html.matchAll(/https?:\/\/[^"'<>\s]+\/@@images\/[^"'<>\s]+/gi)) push(match[0], 85);

  const seen = new Set();
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .filter((item) => {
      const key = item.url.replace(/\?.*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => item.url)
    .slice(0, 8);
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    redirect: 'follow',
    ...options,
    signal: AbortSignal.timeout(9000),
    headers: {
      'user-agent': 'Amazon Environmental Crime Observatory/0.6.4 (+https://amazoncrimes.netlify.app)',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
      ...(options.headers || {})
    }
  });
}

async function discoverMedia(event) {
  const allowedHosts = sourceHosts(event);
  const discovered = [];
  const add = (url, sourceUrl, credit, caption = null) => {
    if (!url || discovered.some((item) => item.url === url)) return;
    discovered.push({ url, source_url: sourceUrl || url, credit: credit || null, caption });
  };

  for (const media of event?.source_media || []) {
    if (!media?.url || (media.type && media.type !== 'image')) continue;
    const normalized = normalizeUrl(media.url, media.url);
    if (!normalized) continue;
    try {
      const response = await fetchWithTimeout(normalized, { headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
      const type = response.headers.get('content-type') || '';
      if (response.ok && type.startsWith('image/')) {
        add(response.url || normalized, media.url, media.credit, media.caption || null);
        continue;
      }
      if (response.ok && type.includes('text/html')) {
        const html = await response.text();
        for (const imageUrl of extractImageCandidates(html, response.url || normalized, allowedHosts)) {
          add(imageUrl, media.url, media.credit, media.caption || null);
        }
      }
    } catch {}
  }

  for (const source of event?.sources || []) {
    if (!source?.url || discovered.length >= 8) continue;
    try {
      const response = await fetchWithTimeout(source.url, { headers: { accept: 'text/html,application/xhtml+xml' } });
      if (!response.ok) continue;
      const type = response.headers.get('content-type') || '';
      if (type.startsWith('image/')) {
        add(response.url || source.url, source.url, source.publisher, null);
        continue;
      }
      if (!type.includes('text/html')) continue;
      const html = await response.text();
      const pageHosts = new Set(allowedHosts);
      try { pageHosts.add(new URL(response.url || source.url).hostname.toLowerCase()); } catch {}
      for (const imageUrl of extractImageCandidates(html, response.url || source.url, pageHosts)) {
        add(imageUrl, source.url, source.publisher, null);
      }
    } catch {}
  }

  return discovered.slice(0, 6);
}

async function proxyImage(event, media, referer) {
  const allowedHosts = sourceHosts(event);
  let parsed;
  try { parsed = new URL(media.url); } catch { return new Response('Invalid image URL', { status: 400 }); }
  if (!hostAllowed(parsed.hostname, allowedHosts)) return new Response('Image host not allowed', { status: 403 });

  const response = await fetchWithTimeout(media.url, {
    headers: {
      accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      referer: referer || media.source_url || event?.sources?.[0]?.url || 'https://amazoncrimes.netlify.app/'
    }
  });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.startsWith('image/')) return new Response('Image unavailable', { status: 404 });
  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff'
    }
  });
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || url.searchParams.get('event_id');
  if (!id) return json(400, { error: 'event_id_required' });

  const event = await getEvent(id);
  if (!event) return json(404, { error: 'event_not_found', id });
  const media = await discoverMedia(event);

  if (url.pathname === '/api/event-image') {
    const index = Math.max(0, Math.min(Number(url.searchParams.get('index')) || 0, 7));
    const item = media[index];
    if (!item) return new Response('No source image', { status: 404 });
    return proxyImage(event, item, item.source_url);
  }

  return json(200, {
    event_id: id,
    count: media.length,
    media: media.map((item, index) => ({
      type: 'image',
      proxy_url: `/api/event-image?id=${encodeURIComponent(id)}&index=${index}`,
      original_url: item.url,
      source_url: item.source_url,
      credit: item.credit || event?.sources?.[0]?.publisher || null,
      caption: item.caption || null
    }))
  });
};

export const config = {
  path: ['/api/event-media', '/api/event-image']
};
