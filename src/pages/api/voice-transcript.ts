import type { APIRoute } from 'astro';

const VOICE_BRIDGE_URL = import.meta.env.VOICE_BRIDGE_URL?.trim() || 'http://localhost:3380';

export const prerender = false;

/**
 * GET /api/voice-transcript?sessionId=xxx
 * Returns live transcript for an active call session.
 */
export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(`${VOICE_BRIDGE_URL}/session/${sessionId}/transcript`);
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
