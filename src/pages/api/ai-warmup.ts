import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'legacy-messenger';

/**
 * Warm-up endpoint — loads the model into VRAM without generating a real response.
 * Call this on page load so the first actual chat message doesn't eat the load time.
 *
 * Strategy: First try a zero-generation keep_alive call (fast if model is already
 * loaded). If loading takes >3s, it's a cold start — the client uses the loadMs
 * value to show appropriate feedback.
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
    const ollamaHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    };
    if (OLLAMA_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OLLAMA_SECRET}`;

    const start = Date.now();
    // Use /api/generate with an empty prompt and num_predict: 0.
    // This loads the model into VRAM without generating any tokens,
    // avoiding Qwen3's thinking overhead entirely.
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: ollamaHeaders,
      body: JSON.stringify({
        model: MODEL,
        prompt: '',
        stream: false,
        keep_alive: '2h',
        options: { num_predict: 0 },
      }),
    });

    const loadMs = Date.now() - start;

    if (!res.ok) {
      return new Response(JSON.stringify({ warm: false, error: 'Model unavailable', loadMs }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      warm: true,
      model: MODEL,
      loadMs,
      cold: loadMs > 3000,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ warm: false, error: 'Connection failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
