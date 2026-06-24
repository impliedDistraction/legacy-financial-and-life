import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

export const prerender = false;

/**
 * GET /api/voice-calls?limit=20
 * Returns recent completed call logs from the bridge.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const limit = url.searchParams.get('limit') || '20';

  try {
    const res = await bridgeFetch(`/calls?limit=${limit}`);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
