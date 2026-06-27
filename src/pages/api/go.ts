import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Tracked click-through redirect for sales campaign emails.
 *
 * Flow: Email CTA → /api/go?pid=X&d=free-quote → logs click → 302 to destination
 *
 * Why: Corporate email security bots (Barracuda, Mimecast, Proofpoint) auto-scan
 * every link in emails. Resend's click tracking fires for ALL of them, making it
 * impossible to tell real clicks from bots. This endpoint serves as a secondary
 * signal: real humans land here via browser redirect (referer, cookies, JS capable).
 * Bots typically stop at a single 302 hop after the initial Resend tracking redirect.
 *
 * Additionally, this routes the user through legacyfinancial.app for lead attribution
 * instead of sending them directly to PlanEnroll where we lose visibility.
 *
 * Query params:
 *   pid  - prospect ID (for attribution)
 *   d    - destination slug: "free-quote" | "book" | "planenroll"
 *   utm_source, utm_medium, utm_campaign - passthrough
 */

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const DESTINATIONS: Record<string, string> = {
  'free-quote': '/free-quote',
  'book': '/book',
  'planenroll': 'https://www.planenroll.com/life?purl=Beth-Byrd',
};

// Rate limit: 30 req per IP per minute (generous for legitimate clicks)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Periodic cleanup (every 5 min) to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 300_000);

export const GET: APIRoute = async ({ request, url }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';

  if (!checkRate(clientIp)) {
    return new Response('Too many requests', { status: 429 });
  }

  const pid = url.searchParams.get('pid')?.trim().slice(0, 64) || null;
  const dest = url.searchParams.get('d')?.trim().slice(0, 32) || 'free-quote';
  const utmSource = url.searchParams.get('utm_source') || 'sales_email';
  const utmMedium = url.searchParams.get('utm_medium') || 'email';
  const utmCampaign = url.searchParams.get('utm_campaign') || '';

  // Resolve destination
  let targetUrl = DESTINATIONS[dest] || DESTINATIONS['free-quote'];

  // Append UTM params for internal destinations
  if (targetUrl.startsWith('/')) {
    const params = new URLSearchParams();
    params.set('utm_source', utmSource);
    params.set('utm_medium', utmMedium);
    if (utmCampaign) params.set('utm_campaign', utmCampaign);
    if (pid) params.set('ref', pid);
    targetUrl = `${targetUrl}?${params.toString()}`;
  }

  // Track the click asynchronously (don't block the redirect)
  if (pid && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    trackSalesClick(pid, dest, clientIp, request.headers.get('user-agent') || '').catch(() => {});
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
      'Cache-Control': 'no-store, no-cache',
    },
  });
};

/**
 * Record the click on the prospect record. This is the REAL engagement signal
 * (as opposed to Resend webhook clicks which are mostly bots).
 */
async function trackSalesClick(prospectId: string, destination: string, ip: string, ua: string) {
  // Validate UUID format to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prospectId)) return;

  const now = new Date().toISOString();

  // Fetch current prospect to merge properties
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${prospectId}&select=id,properties,interaction_stage`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!lookupRes.ok) return;
  const [prospect] = await lookupRes.json();
  if (!prospect) return;

  const existing = prospect.properties || {};
  const siteClicks = Array.isArray(existing.site_clicks) ? existing.site_clicks : [];
  siteClicks.push({ at: now, destination, ip: ip.slice(0, 45), ua: ua.slice(0, 200) });

  // Determine stage promotion
  const currentStage = prospect.interaction_stage || 'new';
  const STAGE_ORDER = ['new', 'quote_offered', 'clicked_cta', 'visited_page', 'interested', 'replied', 'booked'];
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const targetIdx = STAGE_ORDER.indexOf('clicked_cta');
  const shouldPromote = targetIdx > currentIdx;

  const patch: Record<string, unknown> = {
    updated_at: now,
    properties: {
      ...existing,
      site_clicks: siteClicks,
      site_clicked_at: existing.site_clicked_at || now,
      site_click_count: (existing.site_click_count || 0) + 1,
      last_site_click_destination: destination,
    },
  };

  if (shouldPromote) {
    patch.interaction_stage = 'clicked_cta';
  }

  await fetch(`${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${prospectId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}
