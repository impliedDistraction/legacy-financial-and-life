import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const BRIDGE_LOCAL = 'http://localhost:3380';
const BRIDGE_URL = (
  import.meta.env.VOICE_BRIDGE_URL?.trim()
  || import.meta.env.OLLAMA_URL?.trim()?.replace(/\/+$/, '').replace(':3377', ':3380')
  || BRIDGE_LOCAL
);

/** Fetch from voice bridge (port 3380) */
async function bridgeFetch(path: string): Promise<Response> {
  try {
    const res = await fetch(`${BRIDGE_LOCAL}${path}`, {
      signal: AbortSignal.timeout(10000),
    });
    return res;
  } catch {
    // localhost unreachable — expected on Vercel
  }
  return fetch(`${BRIDGE_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
}

/**
 * GET /api/voice-experiments — Get live A/B experiment status from voice bridge
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  const session = await verifySessionCookie(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const res = await bridgeFetch('/experiments');
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Bridge returned ${res.status}` }), { status: 502 });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Bridge unreachable' }), { status: 502 });
  }
};
