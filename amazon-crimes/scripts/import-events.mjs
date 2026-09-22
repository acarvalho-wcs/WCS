import fs from 'node:fs/promises';

const [file, siteArg] = process.argv.slice(2);
const site = siteArg || process.env.OBSERVATORY_SITE_URL;
const token = process.env.OBSERVATORY_ADMIN_TOKEN;
if (!file || !site || !token) {
  console.error('Usage: OBSERVATORY_ADMIN_TOKEN=... node scripts/import-events.mjs <events.json> <https://site.netlify.app>');
  process.exit(1);
}
const raw = JSON.parse(await fs.readFile(file, 'utf8'));
const events = Array.isArray(raw) ? raw : raw.events;
if (!Array.isArray(events)) throw new Error('Input must be an array or { events: [...] }');
const response = await fetch(`${site.replace(/\/$/, '')}/api/events/bulk`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ source: 'cli_import', events })
});
const body = await response.text();
console.log(`HTTP ${response.status}`);
console.log(body);
if (!response.ok && response.status !== 207) process.exit(1);
