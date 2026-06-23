/**
 * GET /api/agent-events?agentId=<id> — SSE proxy to voice bridge.
 * Proxies the bridge's /agent/events SSE stream to the browser,
 * avoiding CORS issues with direct bridge connection.
 */
export const prerender = false;

import type { APIRoute } from 'astro';

const BRIDGE_URL = import.meta.env.OLLAMA_URL?.replace(/\/v1.*$/, '').replace(':3377', ':3380') || 'http://localhost:3380';

export const GET: APIRoute = async ({ url }) => {
  const agentId = url.searchParams.get('agentId');
  if (!agentId) {
    return new Response(JSON.stringify({ error: 'agentId required' }), { status: 400 });
  }

  try {
    const bridgeRes = await fetch(`${BRIDGE_URL}/agent/events?agentId=${encodeURIComponent(agentId)}`, {
      headers: { Accept: 'text/event-stream' },
    });

    if (!bridgeRes.ok || !bridgeRes.body) {
      return new Response(JSON.stringify({ error: 'Bridge SSE connection failed' }), { status: 502 });
    }

    // Stream the response through as-is
    return new Response(bridgeRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bridge unreachable' }), { status: 502 });
  }
};
