/**
 * Voice Bridge client — fetches from the Sentinel voice bridge.
 *
 * Tries localhost:3380 first (same machine / local dev), then falls back
 * to the configured VOICE_BRIDGE_URL (ngrok tunnel for production on Vercel).
 */

const VOICE_BRIDGE_URL = import.meta.env.VOICE_BRIDGE_URL?.trim() || 'http://localhost:3380';
const VOICE_BRIDGE_LOCAL = 'http://localhost:3380';

export async function bridgeFetch(path: string, opts?: RequestInit): Promise<Response> {
  // In local dev, the bridge is on this machine — hit it directly.
  // In production (Vercel), localhost won't work so we fall through to the tunnel URL.
  try {
    const res = await fetch(`${VOICE_BRIDGE_LOCAL}${path}`, {
      ...opts,
      signal: AbortSignal.timeout(3000),
    });
    // Return ANY response from localhost (including errors) — this means the bridge is alive.
    // Only fall through to tunnel if the connection itself fails.
    return res;
  } catch {
    // localhost unreachable — expected on Vercel
  }
  // Fall back to configured URL (ngrok tunnel)
  return fetch(`${VOICE_BRIDGE_URL}${path}`, {
    ...opts,
    signal: AbortSignal.timeout(10000),
  });
}
