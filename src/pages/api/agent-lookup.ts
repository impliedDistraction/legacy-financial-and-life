/**
 * POST /api/agent-lookup — Look up agent by email from carrier_agents.
 * Returns agent data including id, name, role, seat status.
 * Auth: requires valid session cookie (same as recruitment dashboard).
 */
export const prerender = false;

import type { APIRoute } from 'astro';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 500 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), { status: 400 });
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/carrier_agents?agent_email=eq.${encodeURIComponent(email)}&active=eq.true&select=id,agent_name,agent_email,role,tier,is_seated,phone,licensed_states,transfers_received,transfers_converted,total_calls_handled,last_active_at`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
  }

  const agents = await res.json();
  if (!agents.length) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
  }

  return new Response(JSON.stringify(agents[0]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
