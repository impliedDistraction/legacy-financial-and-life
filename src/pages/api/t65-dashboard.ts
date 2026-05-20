import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * GET /api/t65-dashboard?token=xxx — Load client dashboard data
 * POST /api/t65-dashboard — Client actions (add medication, request review, etc.)
 *
 * Token-based access: HMAC-signed dashboard tokens stored in t65_clients.dashboard_token
 * No traditional auth needed — the link IS the credential (like unsubscribe links).
 */

const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.LEGACY_FINANCIAL_CLIENT_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.LEGACY_FINANCIAL_CLIENT_SUPABASE_SERVICE_ROLE_KEY || '';

// Simple in-memory rate limiter
const rateMap = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateMap.get(key) || []).filter(t => t > now - windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  rateMap.set(key, hits);
  return false;
}

async function supabaseFetch(path: string, opts: RequestInit = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.method === 'PATCH' ? 'return=minimal' : 'return=representation',
      ...(opts.headers || {}),
    },
  });
  return res;
}

// ─── GET: Load dashboard ─────────────────────────────────────────────

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();

  if (!token || token.length < 10) {
    return json({ error: 'Invalid token' }, 401);
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`dash-get:${clientIp}`, 30, 60_000)) {
    return json({ error: 'Too many requests' }, 429);
  }

  // Look up client by token
  const res = await supabaseFetch(
    `t65_clients?dashboard_token=eq.${encodeURIComponent(token)}&select=*`
  );
  if (!res.ok) return json({ error: 'Service unavailable' }, 503);

  const clients = await res.json();
  if (!clients.length) return json({ error: 'Invalid or expired token' }, 401);

  const client = clients[0];

  // Update last accessed timestamp
  supabaseFetch(`t65_clients?id=eq.${client.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dashboard_last_accessed: new Date().toISOString() }),
  }).catch(() => {}); // fire-and-forget

  // Fetch plan reviews
  const reviewsRes = await supabaseFetch(
    `t65_plan_reviews?client_id=eq.${client.id}&order=review_year.desc&limit=5`
  );
  const planReviews = reviewsRes.ok ? await reviewsRes.json() : [];

  // Compute IEP start if DOB known
  let iepStart: string | null = null;
  if (client.date_of_birth) {
    const dob = new Date(client.date_of_birth);
    const turn65 = new Date(dob.getFullYear() + 65, dob.getMonth(), dob.getDate());
    const iep = new Date(turn65);
    iep.setMonth(iep.getMonth() - 3);
    iepStart = iep.toISOString().split('T')[0];
  }

  // Return client-safe data (no internal IDs or tokens)
  return json({
    first_name: client.first_name,
    last_name: client.last_name,
    date_of_birth: client.date_of_birth,
    zip_code: client.zip_code,
    state_code: client.state_code,
    county_name: client.county_name,
    marital_status: client.marital_status,
    employment_status: client.employment_status,
    employer_size: client.employer_size,
    planned_retirement_date: client.planned_retirement_date,
    current_coverage_type: client.current_coverage_type,
    prescriptions: client.prescriptions || [],
    preferred_doctors: client.preferred_doctors || [],
    medicare_status: client.medicare_status,
    medicare_part_a: client.medicare_part_a,
    medicare_part_b: client.medicare_part_b,
    status: client.status,
    next_checkin_date: client.next_checkin_date,
    iep_start: iepStart,
    recommended_strategy: client.recommended_strategy,
    plan_reviews: planReviews,
  });
};

// ─── POST: Client actions ────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`dash-post:${clientIp}`, 20, 60_000)) {
    return json({ error: 'Too many requests' }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const token = String(body.token || '').trim();
  const action = String(body.action || '').trim();

  if (!token || token.length < 10) return json({ error: 'Invalid token' }, 401);

  // Verify token
  const res = await supabaseFetch(
    `t65_clients?dashboard_token=eq.${encodeURIComponent(token)}&select=id,prescriptions`
  );
  if (!res.ok) return json({ error: 'Service unavailable' }, 503);
  const clients = await res.json();
  if (!clients.length) return json({ error: 'Invalid token' }, 401);

  const client = clients[0];

  switch (action) {
    case 'add_medication': {
      const med = body.medication as { name?: string; rxcui?: string } | undefined;
      if (!med?.name) return json({ error: 'Medication name required' }, 400);
      const name = String(med.name).slice(0, 200);
      const rxcui = med.rxcui ? String(med.rxcui).slice(0, 20) : undefined;

      const current = Array.isArray(client.prescriptions) ? client.prescriptions : [];
      // Don't add duplicates
      if (current.some((m: { name: string }) => m.name.toLowerCase() === name.toLowerCase())) {
        return json({ ok: true, note: 'Already on file' });
      }
      const updated = [...current, { name, rxcui, added_at: new Date().toISOString() }];
      await supabaseFetch(`t65_clients?id=eq.${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ prescriptions: updated, updated_at: new Date().toISOString() }),
      });

      // Log interaction
      await supabaseFetch('t65_interactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          interaction_type: 'document_upload',
          channel: 'web',
          summary: `Added medication: ${name}`,
          initiated_by: 'client',
        }),
      });

      return json({ ok: true });
    }

    case 'request_review': {
      // Create a plan review request
      const year = new Date().getFullYear();
      await supabaseFetch('t65_plan_reviews', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          review_year: year,
          review_type: 'client_requested',
          status: 'pending',
        }),
      });

      // Log interaction
      await supabaseFetch('t65_interactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          interaction_type: 'plan_review',
          channel: 'web',
          summary: `Client requested free plan review for ${year}`,
          initiated_by: 'client',
        }),
      });

      return json({ ok: true });
    }

    default:
      return json({ error: 'Unknown action' }, 400);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
