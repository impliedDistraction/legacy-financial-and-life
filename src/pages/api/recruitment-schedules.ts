import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

/**
 * GET /api/recruitment-schedules?prospect_ids=id,id
 * Returns Calendly events already matched to the visible recruitment prospects.
 * This is intentionally read-only: it never books, changes, or notifies anyone.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  const rawIds = new URL(request.url).searchParams.get('prospect_ids') || '';
  const ids = rawIds.split(',').filter((id) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)).slice(0, 50);
  if (!ids.length) return Response.json({ schedules: [] });

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/calendly_events?prospect_id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,prospect_id,event_type,start_time,end_time,location,status,is_system_booked,created_at&order=start_time.asc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) return Response.json({ error: 'Failed to load schedules' }, { status: 502 });
    return Response.json({ schedules: await res.json() }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Recruitment schedules error:', error);
    return Response.json({ error: 'Failed to load schedules' }, { status: 500 });
  }
};