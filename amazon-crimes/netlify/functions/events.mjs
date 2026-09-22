import {
  getEvent,
  isAuthorized,
  json,
  listEvents,
  recordIngestRun,
  upsertEvent
} from './event-store.mjs';

async function readJson(request) {
  try { return await request.json(); }
  catch { throw new Error('invalid_json'); }
}

export default async (request, context) => {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isBulk = url.pathname === '/api/events/bulk';
  const id = context.params?.id && context.params.id !== 'bulk' ? context.params.id : null;

  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  try {
    if (method === 'GET' && id) {
      const event = await getEvent(id);
      return event ? json(200, { event }) : json(404, { error: 'not_found', id });
    }

    if (method === 'GET' && !isBulk) {
      return json(200, await listEvents(url));
    }

    if (!isAuthorized(request)) {
      return json(401, { error: 'unauthorized', message: 'A valid OBSERVATORY_ADMIN_TOKEN is required for write operations.' });
    }

    if (method === 'POST' && isBulk) {
      const body = await readJson(request);
      const items = Array.isArray(body) ? body : body.events;
      if (!Array.isArray(items) || !items.length) return json(400, { error: 'events_array_required' });
      if (items.length > 100) return json(413, { error: 'batch_too_large', max: 100 });
      const dryRun = Boolean(body?.dry_run);
      const source = body?.source || 'api_bulk';
      const startedAt = new Date().toISOString();
      const results = [];
      for (const item of items) {
        try { results.push(await upsertEvent(item, { dryRun })); }
        catch (error) { results.push({ action: 'error', id: item?.id || null, message: error.message }); }
      }
      const counts = await recordIngestRun({ source, dryRun, results, startedAt });
      return json(results.some((r) => r.action === 'error') ? 207 : 200, { dry_run: dryRun, source, counts, results });
    }

    if (method === 'POST' && !id) {
      const body = await readJson(request);
      const result = await upsertEvent(body);
      return json(result.action === 'inserted' ? 201 : 200, result);
    }

    if (method === 'PUT' && id) {
      const body = await readJson(request);
      const result = await upsertEvent(body, { forcedId: id });
      return json(200, result);
    }

    return json(405, { error: 'method_not_allowed' }, { allow: 'GET, POST, PUT, OPTIONS' });
  } catch (error) {
    console.error(error);
    const known = ['invalid_json', 'event_must_be_object', 'id_required', 'primary_crime_type_required', 'title_required', 'location_required'];
    return json(known.includes(error.message) ? 400 : 500, { error: known.includes(error.message) ? error.message : 'internal_error', message: error.message });
  }
};

export const config = {
  path: ['/api/events', '/api/events/bulk', '/api/events/:id']
};
