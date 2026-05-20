import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * GET /api/drug-search?q=metform&token=xxx
 *
 * Proxies CMS Marketplace API drug autocomplete for client dashboard.
 * Token-verified (same as t65-dashboard).
 */

const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.LEGACY_FINANCIAL_CLIENT_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.LEGACY_FINANCIAL_CLIENT_SUPABASE_SERVICE_ROLE_KEY || '';
const MARKETPLACE_API_KEY = import.meta.env.MARKETPLACE_API_KEY || '';

const rateMap = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateMap.get(key) || []).filter(t => t > now - windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  rateMap.set(key, hits);
  return false;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim().slice(0, 100);
  const token = url.searchParams.get('token')?.trim();

  if (!query || query.length < 2) {
    return json([], 200);
  }

  if (!token || token.length < 10) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`drug-search:${clientIp}`, 30, 60_000)) {
    return json({ error: 'Too many requests' }, 429);
  }

  // Verify token exists (lightweight check)
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/t65_clients?dashboard_token=eq.${encodeURIComponent(token)}&select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  if (!verifyRes.ok || !(await verifyRes.json()).length) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!MARKETPLACE_API_KEY) {
    return json([], 200);
  }

  // Call CMS Marketplace API
  const year = new Date().getFullYear();
  const cmsUrl = `https://marketplace.api.healthcare.gov/api/v1/drugs/autocomplete?q=${encodeURIComponent(query)}&year=${year}&apikey=${MARKETPLACE_API_KEY}`;

  try {
    const cmsRes = await fetch(cmsUrl, { headers: { Accept: 'application/json' } });
    if (!cmsRes.ok) return json([], 200);
    const drugs = await cmsRes.json();
    // Return simplified format
    return json(
      (drugs || []).slice(0, 10).map((d: { rxcui: string; name: string; strength: string; route: string }) => ({
        rxcui: d.rxcui,
        name: d.name,
        strength: d.strength,
        route: d.route,
      }))
    );
  } catch {
    return json([], 200);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
