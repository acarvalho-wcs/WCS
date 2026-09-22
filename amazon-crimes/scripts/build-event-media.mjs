import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const eventsPath = path.join(root, 'public', 'data', 'events.json');
const mediaDir = path.join(root, 'public', 'media', 'events');
const MAX_BYTES = 8 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 7000;
const IMAGE_TIMEOUT_MS = 9000;
const CONCURRENCY = 6;

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

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] || null;
}

function looksLikeContentImage(url, trusted = false) {
  const s = String(url || '').toLowerCase();
  if (!s) return false;
  const blocked = [
    'logo', 'favicon', 'sprite', 'avatar', 'icon-', 'govbr-logo', 'banner-governo',
    'blank.gif', 'spacer.gif', 'pixel.', 'tracking', 'analytics'
  ];
  if (blocked.some((token) => s.includes(token))) return false;
  if (trusted) return true;
  return /\\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#/])/i.test(s)
    || s.includes('/@@images/')
    || s.includes('/wp-content/uploads/')
    || s.includes('/uploads/')
    || s.includes('/media/')
    || s.includes('/images/')
    || s.includes('/image/');
}

function extractImageCandidates(html, baseUrl) {
  const candidates = [];
  const push = (raw, priority, trusted = false) => {
    const url = normalizeUrl(raw, baseUrl);
    if (!url || !looksLikeContentImage(url, trusted)) return;
    candidates.push({ url, priority });
  };

  for (const tag of html.match(/<meta\\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    if (!['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) continue;
    push(attr(tag, 'content'), 120, true);
  }

  const mediaTags = [
    ...(html.match(/<img\\b[^>]*>/gi) || []),
    ...(html.match(/<source\\b[^>]*>/gi) || [])
  ];

  for (const tag of mediaTags) {
    const src =
      attr(tag, 'src')
      || attr(tag, 'data-src')
      || attr(tag, 'data-original')
      || attr(tag, 'data-lazy-src')
      || attr(tag, 'data-original-src')
      || attr(tag, 'data-full-url');
    push(src, String(src || '').includes('/@@images/') ? 100 : 60);

    const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset') || attr(tag, 'data-lazy-srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        push(part.trim().split(/\\s+/)[0], 70);
      }
    }
  }

  const seen = new Set();
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .filter((item) => {
      const key = item.url.replace(/\\?.*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map((item) => item.url);
}

async function fetchWithTimeout(url, options = {}, timeout = PAGE_TIMEOUT_MS) {
  return fetch(url, {
    redirect: 'follow',
    ...options,
    signal: AbortSignal.timeout(timeout),
    headers: {
      'user-agent': 'Amazon Crimes Observatory/1.0 (+https://acarvalho-wcs.github.io/WCS/)',
      'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7',
      ...(options.headers || {})
    }
  });
}

function safeName(value) {
  return String(value || 'event').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
}

function extensionFor(contentType, url) {
  const type = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  const byType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif'
  };
  if (byType[type]) return byType[type];
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch {}
  return '.jpg';
}

async function discoverCandidates(event) {
  const candidates = [];
  const add = (url, sourceUrl, credit, caption = null) => {
    const normalized = normalizeUrl(url, sourceUrl || url);
    if (!normalized) return;
    if (candidates.some((item) => item.url === normalized)) return;
    candidates.push({
      url: normalized,
      source_url: sourceUrl || normalized,
      credit: credit || null,
      caption
    });
  };

  for (const media of event.source_media || []) {
    if (!media?.url || (media.type && media.type !== 'image')) continue;
    const normalized = normalizeUrl(media.url, media.url);
    if (!normalized) continue;
    add(normalized, media.source_url || event.sources?.[0]?.url || normalized, media.credit, media.caption || null);
  }

  for (const source of (event.sources || []).slice(0, 2)) {
    if (!source?.url) continue;
    try {
      const response = await fetchWithTimeout(source.url, {
        headers: { accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/*,*/*;q=0.8' }
      });
      if (!response.ok) continue;
      const type = response.headers.get('content-type') || '';
      if (type.startsWith('image/')) {
        add(response.url || source.url, source.url, source.publisher, null);
        continue;
      }
      if (!type.includes('text/html')) continue;
      const html = await response.text();
      for (const imageUrl of extractImageCandidates(html, response.url || source.url)) {
        add(imageUrl, source.url, source.publisher, null);
      }
    } catch (error) {
      console.warn(`media discovery: ${event.id}: ${source.url}: ${error.message}`);
    }
  }

  return candidates.slice(0, 12);
}

async function downloadImage(event, candidate, depth = 0) {
  try {
    const response = await fetchWithTimeout(candidate.url, {
      headers: {
        accept: 'image/avif,image/webp,image/*,text/html,application/xhtml+xml,*/*;q=0.8',
        referer: candidate.source_url || event.sources?.[0]?.url || ''
      }
    }, IMAGE_TIMEOUT_MS);

    if (!response.ok) return null;

    const type = (response.headers.get('content-type') || '').toLowerCase();

    // Some public-sector CMSs expose an image through an HTML media-object
    // page (for example, a /view URL). Follow the page's OG/image candidates
    // once instead of discarding the media.
    if (depth < 1 && (type.includes('text/html') || type.includes('application/xhtml+xml'))) {
      const html = await response.text();
      const nested = extractImageCandidates(html, response.url || candidate.url);
      for (const imageUrl of nested.slice(0, 8)) {
        if (imageUrl === candidate.url) continue;
        const cached = await downloadImage(event, {
          ...candidate,
          url: imageUrl
        }, depth + 1);
        if (cached) return cached;
      }
      return null;
    }

    if (!type.startsWith('image/')) return null;

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength && declaredLength > MAX_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) return null;

    const ext = extensionFor(type, response.url || candidate.url);
    const filename = `${safeName(event.id)}${ext}`;
    const outPath = path.join(mediaDir, filename);
    await fs.writeFile(outPath, buffer);

    return {
      type: 'image',
      url: `./media/events/${filename}`,
      original_url: response.url || candidate.url,
      source_url: candidate.source_url || event.sources?.[0]?.url || null,
      credit: candidate.credit || event.sources?.[0]?.publisher || null,
      caption: candidate.caption || null,
      cached_at_build: true
    };
  } catch {
    return null;
  }
}

async function enrichEvent(event) {
  const candidates = await discoverCandidates(event);
  for (const candidate of candidates) {
    const cached = await downloadImage(event, candidate);
    if (cached) {
      event.source_media = [cached];
      return true;
    }
  }
  return false;
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  let cursor = 0;
  const results = [];
  async function runOne() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runOne()));
  return results;
}

await fs.mkdir(mediaDir, { recursive: true });
const payload = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const events = Array.isArray(payload.events) ? payload.events : [];

const enriched = await runPool(events, async (event) => {
  const ok = await enrichEvent(event);
  console.log(`event media ${event.id}: ${ok ? 'cached' : 'unavailable'}`);
  return ok;
});

payload.media_generated_at = new Date().toISOString();
payload.media_cached_count = enriched.filter(Boolean).length;
await fs.writeFile(eventsPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`Cached source images for ${payload.media_cached_count}/${events.length} events`);
