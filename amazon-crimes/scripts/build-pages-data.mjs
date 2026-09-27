import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dataDir = path.join(root, 'public', 'data');

async function writeJson(name, value) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function readJson(name) {
  return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);
}

async function responseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Invalid JSON (${response.status}): ${text.slice(0, 180)}`); }
}

async function refreshLayer(modulePath, outputName, fallback) {
  try {
    const mod = await import(pathToFileURL(path.join(root, modulePath)));
    const response = await withTimeout(Promise.resolve(mod.default()), 20000, outputName);
    const body = await responseJson(response);
    if (!response.ok) throw new Error(body?.message || `${outputName}: HTTP ${response.status}`);
    await writeJson(outputName, body);
    console.log(`refreshed ${outputName}`);
  } catch (error) {
    console.warn(`warning: ${outputName} refresh failed: ${error.message}`);
    try {
      await fs.access(path.join(dataDir, outputName));
    } catch {
      await writeJson(outputName, fallback);
    }
  }
}

async function refreshRadios() {
  const source = await readJson('radios.json');
  let resolver;
  try {
    resolver = (await import(pathToFileURL(path.join(root, 'netlify/functions/radio-stream.mjs')))).default;
  } catch (error) {
    console.warn(`warning: radio resolver import failed: ${error.message}`);
    await writeJson('radios-pages.json', source);
    return;
  }

  const stations = [];
  for (const station of source.stations || []) {
    const copy = { ...station };
    try {
      const params = new URLSearchParams({
        url: station.url || '',
        name: station.name || '',
        city: station.city || ''
      });
      const request = new Request(`https://pages.local/api/radio-stream?${params.toString()}`);
      const response = await withTimeout(Promise.resolve(resolver(request)), 6000, `radio ${station.id}`);
      const data = await responseJson(response);
      if (response.ok) {
        copy.stream_url = data.stream_url || null;
        copy.streams = Array.isArray(data.streams) ? data.streams.slice(0, 5) : [];
        copy.stream_provider = data.provider || null;
        copy.stream_resolved_at = new Date().toISOString();
      }
    } catch (error) {
      console.warn(`warning: radio ${station.id} unresolved: ${error.message}`);
    }
    stations.push(copy);
  }
  await writeJson('radios-pages.json', { ...source, updated_at: new Date().toISOString(), stations });
  console.log(`resolved ${stations.filter(s => s.stream_url).length}/${stations.length} radio streams`);
}


function absoluteUrl(value, base) {
  if (!value) return null;
  try { return new URL(value, base).href; } catch { return null; }
}

function extractCameraMedia(html, pageUrl) {
  const normalizedHtml = String(html || '').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const candidates = [];
  const push = (raw, kind) => {
    const url = absoluteUrl(raw, pageUrl);
    if (!url) return;
    candidates.push({ url, kind });
  };

  for (const match of normalizedHtml.matchAll(/(?:https?:)?\\/\\/[^"'\\s<>]+\\.m3u8[^"'\\s<>]*/gi)) {
    push(match[0], 'stream');
  }

  for (const tag of normalizedHtml.match(/<iframe\\b[^>]*>/gi) || []) {
    const src = tag.match(/\\bsrc\\s*=\\s*["']([^"']+)["']/i)?.[1];
    if (src && /skylinewebcams\\.com/i.test(src)) push(src, 'embed');
  }

  for (const match of normalizedHtml.matchAll(/https?:\\/\\/embed\\.skylinewebcams\\.com\\/[^"'\\s<>]+/gi)) {
    const url = match[0];
    if (/\\/img\\/\\d+\\.jpg/i.test(url) || /media\\.php\\?/i.test(url)) push(url, 'snapshot');
    else push(url, 'embed');
  }

  for (const match of normalizedHtml.matchAll(/(?:src|data-src)\\s*=\\s*["']([^"']*embed\\.skylinewebcams\\.com[^"']+)["']/gi)) {
    const url = match[1];
    if (/\\/img\\/\\d+\\.jpg/i.test(url) || /media\\.php\\?/i.test(url)) push(url, 'snapshot');
    else push(url, 'embed');
  }

  const unique = new Map();
  for (const item of candidates) {
    if (!unique.has(item.url)) unique.set(item.url, item);
  }
  const list = [...unique.values()];
  return {
    stream_url: list.find((item) => item.kind === 'stream')?.url || null,
    embed_url: list.find((item) => item.kind === 'embed')?.url || null,
    snapshot_url: list.find((item) => item.kind === 'snapshot')?.url || null
  };
}

async function refreshCameras() {
  const source = await readJson('cameras.json');
  const cameras = [];
  for (const camera of source.cameras || []) {
    const copy = { ...camera };
    if (camera.amazon_scope === 'within_amazon_region' && camera.original_url) {
      try {
        const response = await withTimeout(fetch(camera.original_url, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'Amazon-Environmental-Crime-Observatory/0.7.0'
          }
        }), 8000, `camera ${camera.id}`);
        if (response.ok) {
          const html = await response.text();
          const media = extractCameraMedia(html, camera.original_url);
          copy.stream_url = media.stream_url;
          copy.embed_url = media.embed_url;
          copy.snapshot_url = media.snapshot_url;
          copy.media_resolved_at = new Date().toISOString();
        }
      } catch (error) {
        console.warn(`warning: camera ${camera.id} media unresolved: ${error.message}`);
      }
    }
    cameras.push(copy);
  }
  await writeJson('cameras.json', { ...source, updated_at: new Date().toISOString(), cameras });
  console.log(`resolved ${cameras.filter(c => c.stream_url).length} camera streams, ${cameras.filter(c => c.embed_url).length} embeds and ${cameras.filter(c => c.snapshot_url).length} snapshots`);
}

await refreshLayer(
  'netlify/functions/amazon-boundary.mjs',
  'amazon-boundary.json',
  { type: 'FeatureCollection', source: 'RAISG', generated_at: null, features: [] }
);

await refreshLayer(
  'netlify/functions/fire-hotspots.mjs',
  'fire-hotspots.json',
  { type: 'FeatureCollection', source: 'INPE Programa Queimadas / BDQueimadas', generated_at: null, features: [] }
);

await refreshLayer(
  'netlify/functions/deforestation-alerts.mjs',
  'deforestation-alerts.json',
  { type: 'FeatureCollection', source: 'INPE DETER / TerraBrasilis', generated_at: null, features: [] }
);

await refreshRadios();
await refreshCameras();
