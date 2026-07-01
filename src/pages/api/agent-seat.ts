/**
 * POST /api/agent-seat — Proxy seat toggle to voice bridge.
 * Auth: requires valid session cookie.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

const BRIDGE_URL = import.meta.env.OLLAMA_URL?.replace(/\/v1.*$/, '').replace(':3377', ':3380') || 'http://localhost:3380';

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: { agentId?: string; seated?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.agentId) {
    return new Response(JSON.stringify({ error: 'agentId required' }), { status: 400 });
  }

  try {
    const res = await fetch(`${BRIDGE_URL}/agent/seat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: body.agentId, seated: body.seated }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Bridge unreachable' }), { status: 502 });
  }
};
