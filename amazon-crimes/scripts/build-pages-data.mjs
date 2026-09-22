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

async function responseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Invalid JSON (${response.status}): ${text.slice(0, 180)}`); }
}

async function refreshLayer(modulePath, outputName, fallback) {
  try {
    const mod = await import(pathToFileURL(path.join(root, modulePath)));
    const response = await mod.default();
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
      const response = await resolver(request);
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
