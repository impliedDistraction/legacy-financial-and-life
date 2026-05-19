import type { APIRoute } from 'astro';
import { isRateLimited } from '../../lib/lead-dedup';

export const prerender = false;

/**
 * POST /api/plan-recommend
 *
 * Accepts consumer demographics and returns plan recommendations from Sentinel.
 * This is a thin proxy that forwards to the Sentinel plan-recommender endpoint.
 *
 * Body: { zip, age, householdSize?, annualIncome?, tobacco?, metalPreference?, prescriptions? }
 * Returns: Plan recommendations with compliance disclosures
 */
export const POST: APIRoute = async ({ request }) => {
  // Rate limit: 10 requests per minute per IP
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (isRateLimited(`plan-recommend:${clientIp}`, 10, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate required fields
  const zip = String(body.zip ?? '').trim().slice(0, 5);
  const age = parseInt(String(body.age ?? '0'));

  if (!zip || !/^\d{5}$/.test(zip)) {
    return new Response(JSON.stringify({ error: 'A valid 5-digit zip code is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!age || age < 0 || age > 120) {
    return new Response(JSON.stringify({ error: 'A valid age is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build request to Sentinel
  const sentinelUrl = import.meta.env.SENTINEL_URL || import.meta.env.OLLAMA_URL;
  if (!sentinelUrl) {
    console.error('[plan-recommend] SENTINEL_URL not configured');
    return new Response(JSON.stringify({
      error: 'Plan recommendation service is temporarily unavailable.',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Sanitize optional fields
  const payload = {
    zip,
    age,
    householdSize: Math.min(10, Math.max(1, parseInt(String(body.householdSize ?? '1')) || 1)),
    annualIncome: body.annualIncome ? Math.max(0, parseInt(String(body.annualIncome))) : undefined,
    tobacco: body.tobacco === true || body.tobacco === 'yes',
    metalPreference: sanitizeEnum(String(body.metalPreference ?? ''), ['Bronze', 'Silver', 'Gold', 'Platinum']),
    prescriptions: Array.isArray(body.prescriptions)
      ? body.prescriptions.slice(0, 20).map((p: unknown) => String(p).trim().slice(0, 100))
      : [],
    topN: 10,
  };

  try {
    const resp = await fetch(`${sentinelUrl}/api/plan-recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[plan-recommend] Sentinel returned ${resp.status}: ${errText}`);
      return new Response(JSON.stringify({
        error: 'Unable to generate recommendations at this time. Please try again.',
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await resp.json();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[plan-recommend] Error calling Sentinel:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({
      error: 'Plan recommendation service timed out. Please try again.',
    }), {
      status: 504,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function sanitizeEnum(value: string, allowed: string[]): string | undefined {
  return allowed.includes(value) ? value : undefined;
}
