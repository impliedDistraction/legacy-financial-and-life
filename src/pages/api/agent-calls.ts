/**
 * GET /api/agent-calls?agentId=<id>&limit=10 — Fetch recent call records for an agent.
 * Returns calls from call_records table where the agent was involved.
 * For now, returns all calls (until agent_id tracking is fully wired).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const GET: APIRoute = async ({ url, request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 500 });
  }

  const agentId = url.searchParams.get('agentId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

  if (!agentId) {
    return new Response(JSON.stringify({ error: 'agentId required' }), { status: 400 });
  }

  // Query call_records — for now get recent calls in sales/recruitment mode
  // Once agent_id is properly set on records, filter by it
  const query = `${SUPABASE_URL}/rest/v1/call_records?order=call_ts.desc&limit=${limit}&select=call_id,call_ts,direction,caller_number,called_number,mode,duration_s,turns,outcome,prospect_name,recording_url,slots&mode=in.(sales,recruitment)`;

  const res = await fetch(query, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Query failed' }), { status: 500 });
  }

  const calls = await res.json();
  return new Response(JSON.stringify(calls), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
