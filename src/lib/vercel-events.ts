/**
 * Server-side Vercel Custom Events integration.
 *
 * Wraps `@vercel/analytics/server` track() to fire Vercel Web Analytics custom
 * events alongside the existing Supabase lead_flow_events writes.  Vercel
 * custom‑event properties are flat string/number/boolean/null values with a
 * 255‑char limit per key and value so we flatten and truncate before sending.
 */

import { track } from '@vercel/analytics/server';

type VercelEventProperties = Record<string, string | number | boolean | null>;
type VercelEventOptions = {
  flags?: string[];
  headers?: Headers | Record<string, string | string[] | undefined>;
  request?: Request | { headers: Headers | Record<string, string | string[] | undefined> };
};

/**
 * Fire a Vercel Web Analytics custom event from a server‑side context.
 * Non‑blocking – failures are logged but never throw.
 *
 * @param eventName  Event name (max 255 chars)
 * @param properties Flat key/value bag (max 255 chars each)
 * @param flags      Optional list of flag keys to annotate the event with
 */
export async function trackVercelEvent(
  eventName: string,
  properties: VercelEventProperties = {},
  options: VercelEventOptions = {},
): Promise<void> {
  try {
    const safeProps = flattenProperties(properties);
    const trackOptions = {
      ...(options.flags?.length ? { flags: options.flags } : {}),
      ...(options.request ? { request: options.request } : {}),
      ...(!options.request && options.headers ? { headers: options.headers } : {}),
    };

    await track(eventName, safeProps, trackOptions);
  } catch (err) {
    // Vercel track() can fail outside of Vercel's runtime or for network
    // reasons.  Never let it break the lead pipeline.
    console.warn('Vercel custom event failed (non‑fatal)', {
      eventName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── helpers ─────────────────────────────────────────────────────────

function flattenProperties(
  input: VercelEventProperties,
): VercelEventProperties {
  const out: VercelEventProperties = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = truncate(rawKey, 255);
    if (!key) continue;

    if (rawValue === null) {
      out[key] = null;
      continue;
    }

    switch (typeof rawValue) {
      case 'string':
        out[key] = truncate(rawValue, 255);
        break;
      case 'number':
      case 'boolean':
        out[key] = rawValue;
        break;
      default:
        // Skip unsupported types silently
        break;
    }
  }

  return out;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
