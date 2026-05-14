import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

/**
 * GET /api/recruitment-chat-logs?prospect_id=UUID
 * Returns AI chat transcript for a specific prospect.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const prospectId = url.searchParams.get('prospect_id');
  if (!prospectId || prospectId.length < 10) {
    return Response.json({ logs: [] });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/recruitment_chat_logs?prospect_id=eq.${encodeURIComponent(prospectId)}&select=id,session_id,user_message,assistant_message,created_at,flagged,flag_reason&order=created_at.asc&limit=100`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!res.ok) {
      return Response.json({ error: 'Failed to load chat logs' }, { status: 502 });
    }

    const logs = await res.json();
    return Response.json({ logs });
  } catch (err) {
    console.error('Chat logs error:', err);
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
};
