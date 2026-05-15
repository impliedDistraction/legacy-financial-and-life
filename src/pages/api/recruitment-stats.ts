import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

/**
 * GET /api/recruitment-stats
 * Returns aggregate engagement counts for the Sent & Tracking stats bar.
 * Counts prospects with tracking properties set in the JSONB `properties` column.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact',
  };

  // Run all count queries in parallel
  // Each query counts prospects where the relevant JSONB property exists and is not null
  const queries = {
    sent: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(sent,converted,follow_up_1,follow_up_2,follow_up_exhausted)&select=id&limit=0`,
    opened: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(sent,converted,follow_up_1,follow_up_2,follow_up_exhausted)&properties->>email_opened_at=not.is.null&select=id&limit=0`,
    clicked: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(sent,converted,follow_up_1,follow_up_2,follow_up_exhausted)&properties->>email_clicked_at=not.is.null&select=id&limit=0`,
    visited: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(sent,converted,follow_up_1,follow_up_2,follow_up_exhausted)&properties->>join_page_visited_at=not.is.null&select=id&limit=0`,
    chatted: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(sent,converted,follow_up_1,follow_up_2,follow_up_exhausted)&properties->>chat_session_id=not.is.null&select=id&limit=0`,
    replied: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(sent,converted,follow_up_1,follow_up_2,follow_up_exhausted)&properties->>email_replied_at=not.is.null&select=id&limit=0`,
    converted: `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.converted&select=id&limit=0`,
    bounced: `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.bounced&select=id&limit=0`,
    follow_up: `${SUPABASE_URL}/rest/v1/${TABLE}?status=in.(follow_up_1,follow_up_2)&select=id&limit=0`,
    no_response: `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.follow_up_exhausted&select=id&limit=0`,
  };

  try {
    const results = await Promise.all(
      Object.entries(queries).map(async ([key, url]) => {
        const res = await fetch(url, { headers });
        const total = res.ok
          ? parseInt(res.headers.get('content-range')?.split('/')[1] || '0')
          : 0;
        return [key, total] as const;
      })
    );

    const stats = Object.fromEntries(results);

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Failed to load recruitment stats:', err);
    return new Response(JSON.stringify({ error: 'Failed to load stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
