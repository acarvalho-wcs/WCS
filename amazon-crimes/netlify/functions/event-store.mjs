import { createHash, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '@netlify/database';

const db = getDatabase();

export function json(status, body, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function canonicalUrl(event) {
  return event?.sources?.find((source) => source?.url)?.url?.trim() || null;
}

function timestampOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function eventFingerprint(event) {
  const day = String(event?.occurred_at || event?.published_at || '').slice(0, 10);
  const fields = [
    event?.primary_crime_type,
    event?.operation_name,
    event?.location?.name,
    event?.location?.admin1,
    event?.location?.country,
    day
  ].map(normalizeText);
  const meaningful = fields.filter(Boolean).length;
  const base = meaningful >= 3 ? fields.join('|') : `${event?.id || ''}|${canonicalUrl(event) || ''}`;
  return createHash('sha256').update(base).digest('hex');
}

export function validateEvent(input, forcedId = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('event_must_be_object');
  const event = structuredClone(input);
  if (forcedId) event.id = forcedId;
  if (!event.id || typeof event.id !== 'string') throw new Error('id_required');
  if (!event.primary_crime_type || typeof event.primary_crime_type !== 'string') throw new Error('primary_crime_type_required');
  if (!Array.isArray(event.crime_types) || !event.crime_types.length) event.crime_types = [event.primary_crime_type];
  if (!event.title || typeof event.title !== 'object') throw new Error('title_required');
  if (!event.location || typeof event.location !== 'object') throw new Error('location_required');
  if (!event.validation_status) event.validation_status = 'UNDER_REVIEW';
  if (!event.priority) event.priority = 'MEDIUM';
  const now = new Date().toISOString();
  if (!timestampOrNull(event.added_at)) event.added_at = now;
  event.updated_at = now;
  return event;
}

export function isAuthorized(request) {
  const expected = process.env.OBSERVATORY_ADMIN_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-observatory-token') || '';
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function syncChildren(client, event) {
  await client.query('DELETE FROM event_sources WHERE event_id = $1', [event.id]);
  await client.query('DELETE FROM event_media WHERE event_id = $1', [event.id]);

  for (const source of event.sources || []) {
    if (!source?.url) continue;
    await client.query(
      `INSERT INTO event_sources (event_id, publisher, url, published_at, source_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, url) DO UPDATE SET
         publisher = EXCLUDED.publisher,
         published_at = EXCLUDED.published_at,
         source_type = EXCLUDED.source_type`,
      [event.id, source.publisher || null, source.url, timestampOrNull(source.published_at), source.source_type || null]
    );
  }

  for (const media of event.source_media || []) {
    if (!media?.url) continue;
    await client.query(
      `INSERT INTO event_media (event_id, media_type, url, credit, caption)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (event_id, url) DO UPDATE SET
         media_type = EXCLUDED.media_type,
         credit = EXCLUDED.credit,
         caption = EXCLUDED.caption`,
      [event.id, media.type || 'image', media.url, media.credit || null, JSON.stringify(media.caption || {})]
    );
  }
}

export async function upsertEvent(input, { forcedId = null, dryRun = false } = {}) {
  const event = validateEvent(input, forcedId);
  const canonical = canonicalUrl(event);
  const fingerprint = eventFingerprint(event);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, canonical_url, fingerprint
         FROM events
        WHERE id = $1
           OR ($2::text IS NOT NULL AND canonical_url = $2)
           OR fingerprint = $3
        ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
        LIMIT 1`,
      [event.id, canonical, fingerprint]
    );

    if (existing.rows.length && existing.rows[0].id !== event.id) {
      await client.query('ROLLBACK');
      return { action: 'duplicate', id: event.id, existing_id: existing.rows[0].id, reason: existing.rows[0].canonical_url === canonical ? 'canonical_url' : 'fingerprint' };
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      return { action: existing.rows.length ? 'would_update' : 'would_insert', id: event.id, fingerprint };
    }

    const location = event.location || {};
    const values = [
      event.id,
      event.primary_crime_type,
      event.crime_types,
      event.validation_status,
      event.priority,
      event.operation_name || null,
      timestampOrNull(event.occurred_at),
      timestampOrNull(event.published_at),
      timestampOrNull(event.added_at) || new Date().toISOString(),
      timestampOrNull(event.updated_at) || new Date().toISOString(),
      Boolean(event.backfill),
      location.name || null,
      location.admin1 || null,
      location.country || null,
      Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
      Number.isFinite(Number(location.lon)) ? Number(location.lon) : null,
      location.precision || null,
      canonical,
      fingerprint,
      JSON.stringify(event)
    ];

    await client.query(
      `INSERT INTO events (
         id, primary_crime_type, crime_types, validation_status, priority, operation_name,
         occurred_at, published_at, added_at, updated_at, backfill,
         location_name, admin1, country, lat, lon, location_precision,
         canonical_url, fingerprint, payload
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         primary_crime_type = EXCLUDED.primary_crime_type,
         crime_types = EXCLUDED.crime_types,
         validation_status = EXCLUDED.validation_status,
         priority = EXCLUDED.priority,
         operation_name = EXCLUDED.operation_name,
         occurred_at = EXCLUDED.occurred_at,
         published_at = EXCLUDED.published_at,
         added_at = EXCLUDED.added_at,
         updated_at = EXCLUDED.updated_at,
         backfill = EXCLUDED.backfill,
         location_name = EXCLUDED.location_name,
         admin1 = EXCLUDED.admin1,
         country = EXCLUDED.country,
         lat = EXCLUDED.lat,
         lon = EXCLUDED.lon,
         location_precision = EXCLUDED.location_precision,
         canonical_url = EXCLUDED.canonical_url,
         fingerprint = EXCLUDED.fingerprint,
         payload = EXCLUDED.payload,
         modified_at = NOW()`,
      values
    );
    await syncChildren(client, event);
    await client.query('COMMIT');
    return { action: existing.rows.length ? 'updated' : 'inserted', id: event.id, fingerprint };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getEvent(id) {
  const rows = await db.sql`SELECT payload FROM events WHERE id = ${id} LIMIT 1`;
  return rows[0]?.payload || null;
}

export async function listEvents(url) {
  const params = [];
  const clauses = [];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)); };
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 1000, 1), 5000);
  const status = url.searchParams.get('status');
  const crimeType = url.searchParams.get('crime_type');
  const country = url.searchParams.get('country');
  const admin1 = url.searchParams.get('admin1');
  const since = timestampOrNull(url.searchParams.get('since'));
  if (status) add('validation_status = ?', status);
  if (crimeType) add('? = ANY(crime_types)', crimeType);
  if (country) add('country = ?', country);
  if (admin1) add('admin1 = ?', admin1);
  if (since) add('COALESCE(occurred_at, published_at, added_at) >= ?', since);
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.pool.query(
    `SELECT payload, updated_at FROM events ${where}
     ORDER BY COALESCE(occurred_at, published_at, added_at) DESC NULLS LAST
     LIMIT $${params.length}`,
    params
  );
  const dataUpdatedAt = result.rows.reduce((latest, row) => {
    const value = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    return value && (!latest || value > latest) ? value : latest;
  }, null);
  return {
    schema_version: '0.5.0',
    generated_at: new Date().toISOString(),
    data_updated_at: dataUpdatedAt,
    source: 'netlify_database',
    count: result.rows.length,
    events: result.rows.map((row) => row.payload)
  };
}

export async function recordIngestRun({ source = 'api', dryRun = false, results = [], startedAt }) {
  const counts = results.reduce((acc, item) => {
    const key = item.action || 'error';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  try {
    await db.sql`
      INSERT INTO ingest_runs (source, dry_run, started_at, finished_at, status, counts, metadata)
      VALUES (${source}, ${dryRun}, ${startedAt}, ${new Date().toISOString()}, ${results.some((r) => r.action === 'error') ? 'PARTIAL' : 'SUCCESS'}, ${JSON.stringify(counts)}::jsonb, ${JSON.stringify({ item_count: results.length })}::jsonb)
    `;
  } catch (error) {
    console.error('ingest_run_log_failed', error);
  }
  return counts;
}
