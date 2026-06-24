import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

export const prerender = false;

/**
 * POST /api/voice-dial
 * Proxy to the Sentinel voice bridge to initiate an outbound AI sales call.
 * Body: { phone, prospectName, prospectContext, testMode, transferNumber }
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
    const { phone, prospectName, prospectContext, testMode, transferNumber } = body;

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

    const res = await bridgeFetch('/dial/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, prospectName, prospectContext, testMode: !!testMode, transferNumber }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : res.status === 429 ? 429 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[voice-dial] Bridge unreachable:', err.message);
    return new Response(
      JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
