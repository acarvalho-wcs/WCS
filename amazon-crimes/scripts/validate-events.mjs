import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'data', 'events.json');

const allowedCrimeTypes = new Set([
  'ILLEGAL_MINING',
  'ILLEGAL_LOGGING',
  'ILLEGAL_DEFORESTATION',
  'LAND_GRABBING',
  'ILLEGAL_HUNTING',
  'WILDLIFE_TRAFFICKING',
  'WILDLIFE_CRIME',
  'ILLEGAL_FISHING',
  'ENVIRONMENTAL_CONTAMINATION',
  'ARSON_ILLEGAL_FIRE',
  'PROTECTED_AREA_INVASION',
  'MULTIPLE_ENVIRONMENTAL_CRIMES',
  'OTHER_ENVIRONMENTAL_CRIME'
]);

const allowedValidationStatus = new Set(['CONFIRMED', 'VALIDATED']);
const langs = ['pt', 'en', 'es'];

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function checkTriLang(obj, field, id) {
  const value = obj?.[field];
  if (!value || typeof value !== 'object') {
    fail(`${id}: missing ${field}`);
    return;
  }
  for (const lang of langs) {
    if (!isNonEmptyString(value[lang])) fail(`${id}: ${field}.${lang} is required`);
  }
}

const payload = JSON.parse(await fs.readFile(file, 'utf8'));

if (!payload || typeof payload !== 'object') fail('Top-level payload must be an object');
if (!isNonEmptyString(payload.schema_version)) fail('schema_version is required');
if (!isValidDate(payload.generated_at)) fail('generated_at must be a valid timestamp');
if (!Array.isArray(payload.events)) fail('events must be an array');

const events = Array.isArray(payload.events) ? payload.events : [];
const seenIds = new Set();
const sourceUrls = new Map();

for (const [index, event] of events.entries()) {
  const id = isNonEmptyString(event?.id) ? event.id : `event[${index}]`;

  if (!isNonEmptyString(event?.id)) fail(`event[${index}]: id is required`);
  else if (seenIds.has(event.id)) fail(`${event.id}: duplicate id`);
  else seenIds.add(event.id);

  checkTriLang(event, 'title', id);
  checkTriLang(event, 'summary', id);
  checkTriLang(event, 'case_context', id);

  if (!allowedCrimeTypes.has(event?.primary_crime_type)) {
    fail(`${id}: unsupported primary_crime_type "${event?.primary_crime_type}"`);
  }

  if (!Array.isArray(event?.crime_types) || event.crime_types.length === 0) {
    fail(`${id}: crime_types must be a non-empty array`);
  } else {
    for (const crime of event.crime_types) {
      if (!allowedCrimeTypes.has(crime)) fail(`${id}: unsupported crime type "${crime}"`);
    }
    if (event.primary_crime_type && !event.crime_types.includes(event.primary_crime_type)) {
      fail(`${id}: primary_crime_type must also appear in crime_types`);
    }
  }

  for (const field of ['occurred_at', 'published_at', 'added_at', 'updated_at']) {
    if (!isValidDate(event?.[field])) fail(`${id}: ${field} must be a valid timestamp`);
  }

  if (!allowedValidationStatus.has(event?.validation_status)) {
    fail(`${id}: validation_status must be CONFIRMED or VALIDATED`);
  }

  const loc = event?.location;
  if (!loc || typeof loc !== 'object') {
    fail(`${id}: location is required`);
  } else {
    if (!isNonEmptyString(loc.name)) fail(`${id}: location.name is required`);
    if (!isNonEmptyString(loc.country)) fail(`${id}: location.country is required`);
    if (!Number.isFinite(loc.lat) || loc.lat < -90 || loc.lat > 90) fail(`${id}: invalid latitude`);
    if (!Number.isFinite(loc.lon) || loc.lon < -180 || loc.lon > 180) fail(`${id}: invalid longitude`);
    if (!isNonEmptyString(loc.precision)) fail(`${id}: location.precision is required`);
  }

  if (!Array.isArray(event?.sources) || event.sources.length === 0) {
    fail(`${id}: at least one source is required`);
  } else {
    for (const [sourceIndex, source] of event.sources.entries()) {
      if (!isNonEmptyString(source?.publisher)) fail(`${id}: sources[${sourceIndex}].publisher is required`);
      if (!isHttpUrl(source?.url)) {
        fail(`${id}: sources[${sourceIndex}].url must be HTTP(S)`);
      } else {
        const normalized = source.url.replace(/\/$/, '');
        if (!sourceUrls.has(normalized)) sourceUrls.set(normalized, []);
        sourceUrls.get(normalized).push(id);
      }
      if (source?.published_at && !isValidDate(source.published_at)) {
        fail(`${id}: sources[${sourceIndex}].published_at is invalid`);
      }
    }
  }

  if (Array.isArray(event?.source_media)) {
    for (const [mediaIndex, media] of event.source_media.entries()) {
      if (media?.url && !isHttpUrl(media.url)) fail(`${id}: source_media[${mediaIndex}].url must be HTTP(S)`);
      if (media?.caption) {
        for (const lang of langs) {
          if (!isNonEmptyString(media.caption[lang])) warn(`${id}: source_media[${mediaIndex}].caption.${lang} is missing`);
        }
      }
    }
  }

  if (event?.published_at && event?.occurred_at && Date.parse(event.published_at) < Date.parse(event.occurred_at)) {
    warn(`${id}: published_at precedes occurred_at; verify the chronology`);
  }

  if (event?.added_at && event?.updated_at && Date.parse(event.updated_at) < Date.parse(event.added_at)) {
    fail(`${id}: updated_at cannot precede added_at`);
  }
}

for (const [url, ids] of sourceUrls.entries()) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > 1) {
    warn(`Source URL reused by multiple events: ${url} -> ${uniqueIds.join(', ')}`);
  }
}

console.log(`Validated ${events.length} events from ${file}`);

for (const message of warnings) console.warn(`WARNING: ${message}`);

if (errors.length) {
  for (const message of errors) console.error(`ERROR: ${message}`);
  console.error(`Validation failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`Validation passed with ${warnings.length} warning(s).`);
