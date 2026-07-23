import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { isCampaignReturnType } from '../../lib/campaign-returns';

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

type RescueCandidate = {
  source_prospect_id: string;
  selection_reason: string;
  recommended_strategy: 'doi_lookup' | 'paid_contact_reveal' | 'brave_identity_research' | 'redraft_only';
  metadata: Record<string, unknown>;
};

function classifyRescueCandidate(prospect: Record<string, unknown>): RescueCandidate | null {
  const properties = (prospect.properties || {}) as Record<string, unknown>;
  const reason = String(prospect.qa_rejection_reason || properties.held_reason || properties.rejection_reason || '').toLowerCase();
  if (prospect.status === 'opted_out' || /compliance|deceased|do not contact/.test(reason)) return null;
  if (!prospect.email) {
    return {
      source_prospect_id: String(prospect.id), selection_reason: 'No email address',
      recommended_strategy: properties.npn ? 'doi_lookup' : 'paid_contact_reveal',
      metadata: { has_npn: Boolean(properties.npn), original_status: prospect.status },
    };
  }
  if (/carrier email/.test(reason)) {
    return {
      source_prospect_id: String(prospect.id), selection_reason: 'Carrier-owned email requires personal-contact discovery',
      recommended_strategy: 'brave_identity_research', metadata: { original_status: prospect.status },
    };
  }
  // Formatting failures should be corrected by the drafting system, not billed as enrichment.
  if (/email too short|poor structure|missing cta|placeholder/.test(reason)) return null;
  if (prospect.status === 'held') {
    return {
      source_prospect_id: String(prospect.id), selection_reason: 'Held with incomplete identity or contact evidence',
      recommended_strategy: 'brave_identity_research', metadata: { original_status: prospect.status },
    };
  }
  return null;
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
      `${SUPABASE_URL}/rest/v1/${TABLE}?order=updated_at.desc&limit=50&select=id,name,parent_campaign_id,source_type,status,search_state,search_filters,send_limit,require_review,auto_relaunch,next_campaign_id,primary_return_type,reply_to_email,sign_off,credit_budget,credits_used,schedule_interval_minutes,last_run_at,next_run_at,created_at,updated_at`,
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

    const campaignIds = campaigns.map((campaign: Record<string, unknown>) => campaign.id).filter(Boolean).join(',');
    const returnSummaries: Record<string, Record<string, unknown>> = {};
    if (campaignIds) {
      const returnsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/campaign_return_summary?campaign_kind=eq.recruitment&campaign_id=in.(${campaignIds})&select=campaign_id,primary_return_type,return_count,realized_return_count,realized_value_cents,latest_return_at`,
        { headers: supaHeaders() }
      ).catch(() => null);
      if (returnsRes?.ok) {
        for (const summary of await returnsRes.json()) returnSummaries[summary.campaign_id] = summary;
      }
    }

    // Enrich campaigns with pipeline and return-outcome counts.
    const enriched = campaigns.map((c: Record<string, unknown>) => ({
      ...c,
      prospect_counts: counts[c.id as string] || {},
      return_summary: returnSummaries[c.id as string] || null,
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
      const primaryReturnType = body.primaryReturnType === undefined
        ? 'recruitment_conversion'
        : body.primaryReturnType;
      if (!isCampaignReturnType(primaryReturnType)) {
        return jsonRes({ error: 'Invalid primaryReturnType' }, 400);
      }
      const record = {
        name,
        client: String(body.client || 'legacy').slice(0, 50),
        source_type: String(body.source || 'prophog').slice(0, 30),
        search_state: String(body.searchState || 'Georgia').slice(0, 50),
        search_filters: sanitizeSearchFilters(body.searchFilters),
        send_limit: body.sendLimit ? Math.max(1, Math.min(10000, parseInt(body.sendLimit))) : null,
        // credit_budget must be >= 5x send_limit to account for hold/reject conversion rates
        credit_budget: Math.max(
          Math.max(1, Math.min(10000, parseInt(body.creditBudget) || 100)),
          body.sendLimit ? Math.min(10000, Math.max(1, parseInt(body.sendLimit)) * 5) : 0
        ),
        max_pages_per_run: Math.max(1, Math.min(50, parseInt(body.maxPagesPerRun) || 20)),
        schedule_interval_minutes: Math.max(1, Math.min(1440, parseInt(body.intervalMinutes) || 60)),
        schedule_jitter_minutes: Math.max(0, Math.min(30, parseInt(body.jitterMinutes) || 15)),
        require_review: body.requireReview !== false,
        auto_relaunch: body.autoRelaunch === true,
        sign_off: String(body.signOff || 'Legacy Financial Recruiting Team').slice(0, 200),
        reply_to_email: body.replyToEmail ? String(body.replyToEmail).slice(0, 200) : null,
        primary_return_type: primaryReturnType,
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

    if (action === 'create_rescue_add_on') {
      const parentCampaignId = typeof body.parentCampaignId === 'string' ? body.parentCampaignId : '';
      const providerPlan = ['doi_only', 'doi_then_apollo', 'brave_research', 'full'].includes(body.providerPlan)
        ? body.providerPlan : '';
      const creditBudget = Math.max(1, Math.min(10000, parseInt(body.creditBudget) || 0));
      if (!parentCampaignId || !providerPlan || !creditBudget) {
        return jsonRes({ error: 'parentCampaignId, providerPlan, and a positive creditBudget are required' }, 400);
      }

      const parentRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(parentCampaignId)}&select=*&limit=1`, { headers: supaHeaders() });
      const [parent] = parentRes.ok ? await parentRes.json() : [];
      if (!parent) return jsonRes({ error: 'Parent campaign not found' }, 404);
      if (!['paused', 'completed'].includes(parent.status)) {
        return jsonRes({ error: 'Pause or complete the parent campaign before creating a rescue add-on' }, 409);
      }

      const prospectsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}?campaign_id=eq.${encodeURIComponent(parentCampaignId)}&or=(status.eq.held,status.eq.rejected)&select=id,status,email,qa_rejection_reason,properties`,
        { headers: supaHeaders() }
      );
      if (!prospectsRes.ok) throw new Error(`Candidate lookup failed: ${prospectsRes.status}`);
      const candidates = (await prospectsRes.json()).map(classifyRescueCandidate).filter(Boolean) as RescueCandidate[];
      if (candidates.length === 0) return jsonRes({ error: 'No actionable held or rejected records qualify for rescue; QA-format and compliance failures are intentionally excluded.' }, 409);

      const planLabel = providerPlan.replace(/_/g, ' ');
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST', headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({
          name: `${parent.name} — Rescue Add-On`, client: parent.client || 'legacy', source_type: 'rescue_addon',
          parent_campaign_id: parent.id, search_state: parent.search_state || 'Unknown', status: 'paused',
          credit_budget: creditBudget, credits_used: 0, require_review: true, auto_relaunch: false,
          primary_return_type: parent.primary_return_type || 'recruitment_conversion',
          sign_off: parent.sign_off || 'Legacy Financial Recruiting Team', reply_to_email: parent.reply_to_email || null,
          search_filters: { rescue_provider_plan: providerPlan, parent_campaign_id: parent.id, candidate_count: candidates.length },
          notes: `Client-authorized rescue add-on. Plan: ${planLabel}. Created paused; no enrichment or outreach runs until explicitly enabled.`,
          created_by: session.email || 'unknown',
        }),
      });
      if (!createRes.ok) throw new Error(`Rescue campaign creation failed: ${createRes.status}`);
      const [rescueCampaign] = await createRes.json();

      const candidateRes = await fetch(`${SUPABASE_URL}/rest/v1/recruitment_rescue_candidates`, {
        method: 'POST', headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(candidates.map(candidate => ({
          ...candidate, rescue_campaign_id: rescueCampaign.id,
          metadata: { ...candidate.metadata, provider_plan: providerPlan },
        }))),
      });
      if (!candidateRes.ok) throw new Error(`Rescue candidate snapshot failed: ${candidateRes.status}`);

      await fetch(`${SUPABASE_URL}/rest/v1/recruitment_campaign_operations`, {
        method: 'POST', headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ campaign_id: parent.id, action: 'create_rescue_add_on', affected_count: candidates.length, actor_email: session.email || null, metadata: { rescue_campaign_id: rescueCampaign.id, provider_plan: providerPlan, credit_budget: creditBudget } }),
      }).catch(() => undefined);
      return jsonRes({ campaign: rescueCampaign, candidateCount: candidates.length }, 201);
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
      if (updates.primaryReturnType !== undefined) {
        if (!isCampaignReturnType(updates.primaryReturnType)) return jsonRes({ error: 'Invalid primaryReturnType' }, 400);
        allowed.primary_return_type = updates.primaryReturnType;
      }

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

      if (action === 'resume') {
        const currentRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=source_type&limit=1`, { headers: supaHeaders() });
        const [current] = currentRes.ok ? await currentRes.json() : [];
        if (current?.source_type === 'rescue_addon') {
          return jsonRes({ error: 'Rescue add-ons remain paused until their client-authorized rescue runner is enabled.' }, 409);
        }
      }

      const newStatus = action === 'stop' ? 'completed' : action === 'pause' ? 'paused' : 'active';
      const patchBody: Record<string, unknown> = {
        status: newStatus,
        next_run_at: action === 'resume' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      // Reset auto-pause counter on resume so it doesn't immediately re-pause
      if (action === 'resume') {
        patchBody.consecutive_zero_runs = 0;
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(patchBody),
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
