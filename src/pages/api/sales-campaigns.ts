import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const CAMPAIGNS_TABLE = 'sales_campaigns';
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

/**
 * GET /api/sales-campaigns — list campaigns with stats
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${CAMPAIGNS_TABLE}?order=updated_at.desc&limit=50`,
      { headers: supaHeaders() }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const campaigns = await res.json();

    // Fetch prospect counts per campaign
    const campaignIds = campaigns.map((c: { id: string }) => c.id);
    let prospectCounts: Record<string, { total: number; sent: number; new: number }> = {};

    if (campaignIds.length > 0) {
      // Get counts per campaign_id for sales leads
      const countRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}?source=eq.apollo_sales_search&sales_campaign_id=not.is.null&select=sales_campaign_id,status`,
        { headers: supaHeaders() }
      );
      if (countRes.ok) {
        const rows: Array<{ sales_campaign_id: string; status: string }> = await countRes.json();
        for (const row of rows) {
          if (!prospectCounts[row.sales_campaign_id]) {
            prospectCounts[row.sales_campaign_id] = { total: 0, sent: 0, new: 0 };
          }
          prospectCounts[row.sales_campaign_id].total++;
          if (row.status === 'sent') prospectCounts[row.sales_campaign_id].sent++;
          if (row.status === 'new' || row.status === 'approved') prospectCounts[row.sales_campaign_id].new++;
        }
      }
    }

    // Also count unassigned pool
    const poolRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}?source=eq.apollo_sales_search&sales_campaign_id=is.null&select=id&limit=0`,
      { headers: { ...supaHeaders(), Prefer: 'count=exact' } }
    );
    const poolCount = poolRes.ok
      ? parseInt(poolRes.headers.get('content-range')?.split('/')[1] || '0', 10)
      : 0;

    return jsonRes({ campaigns, prospectCounts, poolCount });
  } catch (err) {
    console.error('sales-campaigns GET error:', err);
    return jsonRes({ error: 'Failed to fetch campaigns' }, 500);
  }
};

/**
 * POST /api/sales-campaigns — create or update a campaign
 * Body: { action: 'create' | 'update' | 'activate' | 'pause' | 'complete', ...fields }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action || 'create');

  try {
    if (action === 'create') {
      const name = String(body.name || '').trim().slice(0, 200);
      const objective = String(body.objective || '').trim().slice(0, 50);
      const description = String(body.description || '').trim().slice(0, 2000);
      const states = Array.isArray(body.states) ? body.states.map((s: unknown) => String(s).trim().slice(0, 2)) : [];

      if (!name || !objective) {
        return jsonRes({ error: 'Name and objective are required' }, 400);
      }

      const validObjectives = ['t65', 'health', 'life', 'key_person', 'final_expense'];
      if (!validObjectives.includes(objective)) {
        return jsonRes({ error: `Objective must be one of: ${validObjectives.join(', ')}` }, 400);
      }

      // Generate Apollo search prompt based on objective
      const apolloPrompt = generateApolloPrompt(objective, description, states);

      const insert = {
        name,
        objective,
        description,
        states,
        apollo_prompt: apolloPrompt,
        status: 'draft',
        daily_limit: Number(body.daily_limit) || 50,
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${CAMPAIGNS_TABLE}`, {
        method: 'POST',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(insert),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Insert failed: ${res.status} — ${err}`);
      }
      const [campaign] = await res.json();
      return jsonRes({ campaign, apolloPrompt });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) return jsonRes({ error: 'Campaign id required' }, 400);

      const allowed = ['name', 'description', 'states', 'daily_limit', 'apollo_prompt', 'apollo_params',
        'seniorities', 'industries', 'employee_ranges', 'custom_titles',
        'from_name', 'from_label', 'reply_to', 'sign_off', 'cta_url', 'cta_label',
        'secondary_cta_url', 'secondary_cta_label', 'send_hours_start', 'send_hours_end'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      if (Object.keys(updates).length === 0) {
        return jsonRes({ error: 'No valid fields to update' }, 400);
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${CAMPAIGNS_TABLE}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      const [campaign] = await res.json();
      return jsonRes({ campaign });
    }

    if (action === 'activate' || action === 'pause' || action === 'complete') {
      const id = String(body.id || '');
      if (!id) return jsonRes({ error: 'Campaign id required' }, 400);

      const statusMap: Record<string, string> = {
        activate: 'active',
        pause: 'paused',
        complete: 'completed',
      };
      const updates: Record<string, unknown> = { status: statusMap[action] };
      if (action === 'activate') updates.activated_at = new Date().toISOString();
      if (action === 'complete') updates.completed_at = new Date().toISOString();

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${CAMPAIGNS_TABLE}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Status update failed: ${res.status}`);
      const [campaign] = await res.json();
      return jsonRes({ campaign });
    }

    if (action === 'assign_prospects') {
      // Assign unassigned pool prospects to a campaign
      const id = String(body.id || '');
      const limit = Math.min(Number(body.limit) || 50, 500);
      if (!id) return jsonRes({ error: 'Campaign id required' }, 400);

      // Fetch unassigned sales leads
      const fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}?source=eq.apollo_sales_search&sales_campaign_id=is.null&status=in.(new,approved)&limit=${limit}&order=created_at.asc&select=id`,
        { headers: supaHeaders() }
      );
      if (!fetchRes.ok) throw new Error('Failed to fetch unassigned prospects');
      const prospects: Array<{ id: string }> = await fetchRes.json();

      if (prospects.length === 0) {
        return jsonRes({ assigned: 0, message: 'No unassigned prospects in pool' });
      }

      // Batch assign
      const ids = prospects.map(p => p.id);
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}?id=in.(${ids.join(',')})`,
        {
          method: 'PATCH',
          headers: { ...supaHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({ sales_campaign_id: id }),
        }
      );
      if (!patchRes.ok) throw new Error(`Assign failed: ${patchRes.status}`);

      return jsonRes({ assigned: ids.length });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('sales-campaigns POST error:', err);
    return jsonRes({ error: 'Operation failed' }, 500);
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────

function generateApolloPrompt(objective: string, description: string, states: string[]): string {
  const stateStr = states.length ? states.join(', ') : 'Georgia, Florida, Texas';

  const objectiveDescriptions: Record<string, string> = {
    t65: `Find professionals and business owners turning 65 in the next 12 months who need Medicare supplement and life insurance guidance. Target people in senior management or ownership roles at small-to-midsize companies in ${stateStr}.`,
    health: `Find small business owners and self-employed professionals who likely need individual health insurance coverage. Focus on founders, owners, and freelancers in ${stateStr} who may not have group coverage.`,
    life: `Find business owners, executives, and high-earning professionals who need life insurance for family protection, key-person coverage, or buy-sell agreements. Target owners and C-suite at companies with 1-100 employees in ${stateStr}.`,
    key_person: `Find companies with 10-100 employees whose leadership likely needs key-person life insurance. Target CEOs, founders, and managing partners at growing businesses in ${stateStr}.`,
    final_expense: `Find individuals or professionals approaching retirement age who may need affordable final expense or burial coverage. Focus on small business owners and independent professionals in ${stateStr}.`,
  };

  let prompt = objectiveDescriptions[objective] || `Find potential life insurance buyers in ${stateStr}.`;

  if (description) {
    prompt += `\n\nAdditional targeting: ${description}`;
  }

  prompt += `\n\nSearch Apollo for people matching this profile. Focus on those with verified email addresses. Prioritize quality over quantity — we want decision-makers who would respond to a personalized outreach.`;

  return prompt;
}
