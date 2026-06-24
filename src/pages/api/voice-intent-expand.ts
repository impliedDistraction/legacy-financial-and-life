import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

export const prerender = false;

/**
 * POST /api/voice-intent-expand
 *
 * Takes a description or keyword and uses LLM to generate likely
 * STT-transcribed phrasings, returning a suggested regex pattern.
 *
 * Body: { description: string, context?: string }
 * Returns: { phrases: string[], regex: string }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const description = (body.description || '').trim().slice(0, 200);
  const context = (body.context || '').trim().slice(0, 500);
  if (!description) {
    return new Response(JSON.stringify({ error: 'description required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Proxy to Sentinel's expand-intent endpoint
    const res = await bridgeFetch('/expand-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, context }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err || 'Bridge error' }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Bridge unreachable: ' + err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * GET /api/voice-intent-expand
 *
 * Returns the intent library (for editor dropdowns).
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await bridgeFetch('/intent-library');
    if (!res.ok) {
      return new Response(JSON.stringify({ intents: {} }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ intents: {} }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
};
