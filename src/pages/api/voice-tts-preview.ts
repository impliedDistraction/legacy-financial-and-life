export const prerender = false;

import type { APIRoute } from 'astro';
import { bridgeFetch } from '../../lib/voice-bridge';

/**
 * POST /api/voice-tts-preview
 *
 * Proxies TTS generation requests to the voice bridge.
 * Body: { text: string } — returns audio/mpeg blob
 * Body: { texts: string[], cache: true } — pre-caches multiple phrases
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  // Multi-cache mode
  if (body.cache && Array.isArray(body.texts)) {
    try {
      const res = await bridgeFetch('/tts-cache-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: body.texts }),
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'Bridge cache failed' }), { status: 502 });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Bridge unreachable' }), { status: 502 });
    }
  }

  // Single text playback mode
  const text = body.text?.trim();
  if (!text || text.length > 1000) {
    return new Response(JSON.stringify({ error: 'text required (max 1000 chars)' }), { status: 400 });
  }

  try {
    const res = await bridgeFetch('/tts-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      return new Response(JSON.stringify({ error: err }), { status: 502 });
    }

    // Stream audio back
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bridge unreachable' }), { status: 502 });
  }
};
