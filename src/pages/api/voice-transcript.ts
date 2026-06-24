import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

export const prerender = false;

/**
 * GET /api/voice-transcript?sessionId=xxx
 * Returns live transcript for an active call session.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await bridgeFetch(`/session/${sessionId}/transcript`);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
