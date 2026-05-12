import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

/**
 * POST /api/join-visit
 * Fires when a real browser loads the /join page with a ?pid= parameter.
 * Records the visit in the prospect record and lead_flow_events.
 * This distinguishes real human page views from bot/scanner link prefetches.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ ok: false }, { status: 503 });
  }

  let body: { prospectId?: string; tier?: string; referrer?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { prospectId, tier, referrer } = body;
  if (!prospectId || typeof prospectId !== 'string' || prospectId.length < 10) {
    return Response.json({ ok: true }); // silently ignore non-prospect visits
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || '';
  const userAgent = request.headers.get('user-agent') || '';
  const now = new Date().toISOString();

  try {
    // Fetch existing prospect to merge properties
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(prospectId)}&select=properties,interaction_stage`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!existingRes.ok) {
      return Response.json({ ok: false }, { status: 502 });
    }

    const [row] = await existingRes.json();
    if (!row) {
      return Response.json({ ok: true }); // prospect not found — ignore
    }

    const existing = row.properties || {};

    // Build visit record
    const visitRecord = {
      at: now,
      ip: clientIp,
      userAgent: userAgent.slice(0, 300),
      tier: tier || 'unknown',
      referrer: referrer || null,
    };

    // Append to visits array
    const visits = Array.isArray(existing.join_page_visits) ? existing.join_page_visits : [];
    visits.push(visitRecord);

    const propsPatch: Record<string, unknown> = {
      join_page_visited_at: now,
      join_page_visits: visits,
      join_page_visit_count: visits.length,
    };

    // Only promote interaction_stage if it's still early-stage
    const stage = row.interaction_stage || 'new';
    const earlyStages = new Set(['new', 'clicked_cta']);
    const update: Record<string, unknown> = {
      properties: { ...existing, ...propsPatch },
      updated_at: now,
    };
    if (earlyStages.has(stage)) {
      update.interaction_stage = 'visited_page';
    }

    await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(prospectId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(update),
      },
    );

    // Log to lead_flow_events for analytics
    await trackLeadEvent({
      trackingId: prospectId,
      route: '/join',
      eventName: 'join_page_visited',
      source: 'client',
      stage: 'landing',
      status: 'success',
      ownerScope: 'legacy',
      properties: {
        prospect_id: prospectId,
        tier: tier || 'unknown',
        visit_number: visits.length,
        user_agent: userAgent.slice(0, 200),
        referrer: referrer || null,
      },
    }).catch(() => {});
  } catch (err) {
    console.error('join-visit tracking error:', err);
  }

  return Response.json({ ok: true });
};

export const GET: APIRoute = async () => new Response('Method not allowed', { status: 405 });
