import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SENTINEL_URL = import.meta.env.OLLAMA_URL || '';
const SENTINEL_SECRET = import.meta.env.OLLAMA_SECRET || '';

/**
 * GET /api/system-status — Proxy to Sentinel /system-status for infrastructure monitoring.
 * POST /api/system-status — Proxy control actions to Sentinel /system-control.
 *
 * Auth: magic-link session required.
 * The OLLAMA_URL env var points to the ngrok tunnel → localhost:3377 on the GPU box.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!SENTINEL_URL) {
    return json({ error: 'Sentinel not configured', offline: true }, 503);
  }

  try {
    const headers: Record<string, string> = {
      'ngrok-skip-browser-warning': '1',
    };
    if (SENTINEL_SECRET) headers['Authorization'] = `Bearer ${SENTINEL_SECRET}`;

    const res = await fetch(`${SENTINEL_URL}/system-status`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return json({ error: `Sentinel returned ${res.status}`, offline: true }, 502);
    }

    const data = await res.json();
    return json(data);
  } catch (err: any) {
    // Sentinel is unreachable — machine is offline or tunnel down
    return json({
      error: err.message || 'Sentinel unreachable',
      offline: true,
      hint: 'GPU machine may be powered off or ngrok tunnel is down',
    }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!SENTINEL_URL) {
    return json({ error: 'Sentinel not configured', offline: true }, 503);
  }

  try {
    const body = await request.json();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    };
    if (SENTINEL_SECRET) headers['Authorization'] = `Bearer ${SENTINEL_SECRET}`;

    const res = await fetch(`${SENTINEL_URL}/system-control`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return json({ error: `Sentinel returned ${res.status}: ${text}` }, 502);
    }

    const data = await res.json();
    return json(data);
  } catch (err: any) {
    return json({ error: err.message || 'Sentinel unreachable', offline: true }, 503);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
