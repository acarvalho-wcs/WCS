import { getDatabase } from '@netlify/database';

export default async () => {
  const timestamp = new Date().toISOString();
  try {
    const db = getDatabase();
    const rows = await db.sql`SELECT COUNT(*)::int AS event_count FROM events`;
    return Response.json({
      ok: true,
      service: 'amazon-environmental-crime-observatory',
      version: '0.5.0',
      database: 'connected',
      event_count: rows[0]?.event_count ?? 0,
      timestamp
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({
      ok: false,
      service: 'amazon-environmental-crime-observatory',
      version: '0.5.0',
      database: 'unavailable',
      error: error.message,
      timestamp
    }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};

export const config = { path: '/api/health' };
