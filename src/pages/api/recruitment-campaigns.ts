import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_campaigns';
const PROSPECTS_TABLE = 'recruitment_prospects';

function supaHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sanitize search_filters JSON — only allow known keys with string/boolean values */
function sanitizeSearchFilters(raw: unknown): Record<string, string | boolean | undefined> {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const allowed: Record<string, 'string' | 'boolean'> = {
    licenseEffectiveFrom: 'string',
    licenseEffectiveTo: 'string',
    onlyNewAgents: 'boolean',
    county: 'string',
    city: 'string',
    licenseTycl: 'string',
    residencyType: 'string',
  };
  const result: Record<string, string | boolean | undefined> = {};
  for (const [k, type] of Object.entries(allowed)) {
    if (k in src && typeof src[k] === type) {
      result[k] = src[k] as string | boolean;
    }
  }
  return result;
}

/**
 * GET /api/recruitment-campaigns — list campaigns + prospect counts
 * POST /api/recruitment-campaigns — create or update a campaign
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  try {
    // Fetch all campaigns ordered by most recent activity
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?order=updated_at.desc&limit=50`,
      { headers: supaHeaders() }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const campaigns = await res.json();

    // Fetch prospect counts grouped by campaign + status
    const countsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/campaign_prospect_counts`,
      { method: 'POST', headers: supaHeaders(), body: '{}' }
    ).catch(() => null);

    // If the RPC doesn't exist yet, fall back to basic counts
    let counts: Record<string, Record<string, number>> = {};
    if (countsRes?.ok) {
      const rows = await countsRes.json();
      for (const r of rows) {
        if (!counts[r.campaign_id]) counts[r.campaign_id] = {};
        counts[r.campaign_id][r.status] = r.count;
      }
    }

    // Enrich campaigns with counts
    const enriched = campaigns.map((c: Record<string, unknown>) => ({
      ...c,
      prospect_counts: counts[c.id as string] || {},
    }));

    return jsonRes({ campaigns: enriched });
  } catch (err: unknown) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const name = String(body.name || 'Untitled Search').slice(0, 200);
      const record = {
        name,
        client: String(body.client || 'legacy').slice(0, 50),
        source_type: String(body.source || 'prophog').slice(0, 30),
        search_state: String(body.searchState || 'Georgia').slice(0, 50),
        search_filters: sanitizeSearchFilters(body.searchFilters),
        credit_budget: Math.max(1, Math.min(10000, parseInt(body.creditBudget) || 100)),
        send_limit: body.sendLimit ? Math.max(1, Math.min(10000, parseInt(body.sendLimit))) : null,
        max_pages_per_run: Math.max(1, Math.min(50, parseInt(body.maxPagesPerRun) || 20)),
        schedule_interval_minutes: Math.max(1, Math.min(1440, parseInt(body.intervalMinutes) || 60)),
        schedule_jitter_minutes: Math.max(0, Math.min(30, parseInt(body.jitterMinutes) || 15)),
        require_review: body.requireReview !== false,
        auto_relaunch: body.autoRelaunch === true,
        sign_off: String(body.signOff || 'Legacy Financial Recruiting Team').slice(0, 200),
        reply_to_email: body.replyToEmail ? String(body.replyToEmail).slice(0, 200) : null,
        status: 'active',
        created_by: session.email || 'unknown',
        notes: String(body.notes || '').slice(0, 500),
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(record),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Insert failed: ${res.status} ${err}`);
      }

      const [created] = await res.json();
      return jsonRes({ campaign: created }, 201);
    }

    if (action === 'update') {
      const { id, ...updates } = body;
      if (!id) return jsonRes({ error: 'id required' }, 400);

      const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) allowed.name = String(updates.name).slice(0, 200);
      if (updates.status !== undefined) allowed.status = String(updates.status).slice(0, 20);
      if (updates.creditBudget !== undefined) allowed.credit_budget = Math.max(1, parseInt(updates.creditBudget) || 100);
      if (updates.maxPagesPerRun !== undefined) allowed.max_pages_per_run = Math.max(1, Math.min(50, parseInt(updates.maxPagesPerRun) || 20));
      if (updates.intervalMinutes !== undefined) allowed.schedule_interval_minutes = Math.max(1, parseInt(updates.intervalMinutes) || 60);
      if (updates.notes !== undefined) allowed.notes = String(updates.notes).slice(0, 500);
      if (updates.autoRelaunch !== undefined) allowed.auto_relaunch = updates.autoRelaunch === true;
      if (updates.searchFilters !== undefined) allowed.search_filters = updates.searchFilters;
      if (updates.signOff !== undefined) allowed.sign_off = String(updates.signOff).slice(0, 200);
      if (updates.replyToEmail !== undefined) allowed.reply_to_email = updates.replyToEmail ? String(updates.replyToEmail).slice(0, 200) : null;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(allowed),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      const [updated] = await res.json();
      return jsonRes({ campaign: updated });
    }

    if (action === 'pause' || action === 'resume' || action === 'stop') {
      const { id } = body;
      if (!id) return jsonRes({ error: 'id required' }, 400);

      const newStatus = action === 'stop' ? 'completed' : action === 'pause' ? 'paused' : 'active';
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({
          status: newStatus,
          next_run_at: action === 'resume' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`${action} failed: ${res.status}`);
      const [updated] = await res.json();
      return jsonRes({ campaign: updated });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
};
