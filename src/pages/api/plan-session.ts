import type { APIRoute } from 'astro';
import { isRateLimited } from '../../lib/lead-dedup';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/plan-session
 *
 * Creates a quote session (and optionally a plan selection) in the database.
 * Called when a consumer selects a plan for enrollment.
 *
 * Body: {
 *   zip, age, dob?, householdSize?, annualIncome?, tobacco?,
 *   name, email, phone?,
 *   pathway?: 'marketplace' | 'medicare',
 *   plan?: { planId, planName, issuerName, metalLevel, planType, monthlyPremium, estimatedNetPremium, deductible, maxOutOfPocket },
 *   prescriptions?: string[],
 *   subsidy?: object,
 *   source?: string
 * }
 */
export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (isRateLimited(`plan-session:${clientIp}`, 10, 60_000)) {
    return jsonResponse(429, { error: 'Too many requests.' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonResponse(503, { error: 'Service unavailable.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  const zip = String(body.zip ?? '').trim().slice(0, 5);
  const age = parseInt(String(body.age ?? '0'));
  const name = String(body.name ?? '').trim().slice(0, 200);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 254);

  if (!zip || !name) {
    return jsonResponse(400, { error: 'Zip code and name are required.' });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: 'Invalid email address.' });
  }

  // Resolve county (we trust the frontend sent a valid zip, but re-resolve server-side)
  const sentinelUrl = import.meta.env.SENTINEL_URL || import.meta.env.OLLAMA_URL;
  let state = String(body.state ?? '').slice(0, 2);
  let countyFips = String(body.countyFips ?? '');

  // If we don't have state/county, resolve from zip via Sentinel
  if (!state || !countyFips) {
    if (sentinelUrl) {
      try {
        const resp = await fetch(`${sentinelUrl}/api/plan-recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zip, age: age || 40 }),
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) {
          const result = await resp.json();
          state = result.location?.state || state;
          countyFips = result.location?.countyFips || countyFips;
        }
      } catch { /* proceed without */ }
    }
  }

  const pathway = (body.pathway === 'medicare' || age >= 64) ? 'medicare' : 'marketplace';

  // Create quote session
  const sessionRecord = {
    consumer_name: name,
    consumer_email: email || null,
    consumer_phone: String(body.phone ?? '').trim().slice(0, 20) || null,
    consumer_dob: body.dob || null,
    consumer_age: age || null,
    zip_code: zip,
    state_code: state || 'XX',
    county_fips: countyFips || 'unknown',
    household_size: parseInt(String(body.householdSize ?? '1')) || 1,
    annual_income: body.annualIncome ? parseInt(String(body.annualIncome)) : null,
    tobacco_use: body.tobacco === true || body.tobacco === 'yes',
    pathway,
    prescriptions: Array.isArray(body.prescriptions) ? JSON.stringify(body.prescriptions) : '[]',
    subsidy_estimate: body.subsidy ? JSON.stringify(body.subsidy) : null,
    status: body.plan ? 'plan_selected' : 'quoted',
    source: String(body.source ?? 'health-quote').slice(0, 50),
    tracking_id: String(body.trackingId ?? '').slice(0, 100) || null,
  };

  const sessionRes = await supabaseInsert('quote_sessions', sessionRecord);
  if (!sessionRes.ok || !sessionRes.data?.[0]?.id) {
    console.error('[plan-session] Failed to create session:', sessionRes.error);
    return jsonResponse(500, { error: 'Failed to create session.' });
  }

  const sessionId = sessionRes.data[0].id;
  let selectionId: string | null = null;

  // If a plan was selected, create plan_selection record
  const plan = body.plan as Record<string, unknown> | undefined;
  if (plan && plan.planId) {
    const selectionRecord = {
      session_id: sessionId,
      plan_id: String(plan.planId).slice(0, 50),
      plan_name: String(plan.planName ?? '').slice(0, 300),
      issuer_name: String(plan.issuerName ?? '').slice(0, 200),
      metal_level: String(plan.metalLevel ?? '').slice(0, 30),
      plan_type: String(plan.planType ?? '').slice(0, 20),
      monthly_premium: plan.monthlyPremium ? Number(plan.monthlyPremium) : null,
      estimated_net_premium: plan.estimatedNetPremium != null ? Number(plan.estimatedNetPremium) : null,
      deductible: String(plan.deductible ?? '').slice(0, 50),
      max_out_of_pocket: String(plan.maxOutOfPocket ?? '').slice(0, 50),
      status: 'selected',
    };

    const selRes = await supabaseInsert('plan_selections', selectionRecord);
    if (selRes.ok && selRes.data?.[0]?.id) {
      selectionId = selRes.data[0].id;
    }
  }

  // Record event
  await supabaseInsertMinimal('enrollment_events', {
    session_id: sessionId,
    selection_id: selectionId,
    event_type: pathway === 'medicare' ? 'medicare_request_submitted' : 'quote_generated',
    actor: 'consumer',
    event_data: JSON.stringify({ zip, age, pathway }),
  });

  return jsonResponse(200, {
    sessionId,
    selectionId,
    pathway,
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function supabaseInsert(table: string, record: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status}: ${text}`, data: null };
  }
  const data = await res.json();
  return { ok: true, data, error: null };
}

async function supabaseInsertMinimal(table: string, record: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(record),
  });
}
