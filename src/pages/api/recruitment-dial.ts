import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

export const prerender = false;

/**
 * POST /api/recruitment-dial
 * Proxy to the Sentinel voice bridge to initiate an outbound AI recruitment call.
 * Body: { phone, prospectId, prospectName, prospectContext, transferNumber, testMode }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { phone, prospectId, prospectName, prospectContext, transferNumber, testMode } = body;

    if (!phone || typeof phone !== 'string') {
      return new Response(JSON.stringify({ error: 'Phone number required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!transferNumber || typeof transferNumber !== 'string') {
      return new Response(JSON.stringify({ error: 'Transfer number required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await bridgeFetch('/dial/recruitment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, prospectId, prospectName, prospectContext, transferNumber, testMode: !!testMode }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : res.status === 429 ? 429 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[recruitment-dial] Bridge unreachable:', err.message);
    return new Response(
      JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
