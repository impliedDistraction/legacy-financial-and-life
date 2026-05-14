import type { APIRoute } from 'astro';

const VOICE_BRIDGE_URL = import.meta.env.VOICE_BRIDGE_URL?.trim() || 'http://localhost:3380';

/**
 * POST /api/recruitment-dial
 * Proxy to the Sentinel voice bridge to initiate an outbound AI recruitment call.
 * Body: { phone, prospectId, prospectName, prospectContext }
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { phone, prospectId, prospectName, prospectContext } = body;

    if (!phone || typeof phone !== 'string') {
      return new Response(JSON.stringify({ error: 'Phone number required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${VOICE_BRIDGE_URL}/dial/recruitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, prospectId, prospectName, prospectContext }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 502,
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
