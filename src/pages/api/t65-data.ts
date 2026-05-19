import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL?.trim() || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';

/**
 * GET /api/t65-data
 * Proxies to Sentinel's /t65-data endpoint to fetch
 * census T65 hotspot data and voter roll T65 data for the heatmap.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (OLLAMA_SECRET) headers['Authorization'] = `Bearer ${OLLAMA_SECRET}`;

    const res = await fetch(`${OLLAMA_URL}/t65-data`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Sentinel returned ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch T65 data' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
