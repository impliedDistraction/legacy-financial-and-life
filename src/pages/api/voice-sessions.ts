import type { APIRoute } from 'astro';

const VOICE_BRIDGE_URL = import.meta.env.VOICE_BRIDGE_URL?.trim() || 'http://localhost:3380';

export const prerender = false;

/**
 * GET /api/voice-sessions
 * Returns active call sessions from the voice bridge.
 */
export const GET: APIRoute = async () => {
  try {
    const res = await fetch(`${VOICE_BRIDGE_URL}/sessions`);
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
