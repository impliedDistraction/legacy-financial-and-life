import type { APIRoute } from 'astro';
import { isCampaignReturnType } from '../../lib/campaign-returns';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Database not configured' }, 503);

  const url = new URL(request.url);
  const campaignKind = url.searchParams.get('campaign_kind');
  const campaignId = url.searchParams.get('campaign_id') || '';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 1), 100);

  if (campaignKind !== 'recruitment' && campaignKind !== 'sales') return json({ error: 'Invalid campaign_kind' }, 400);
  if (!campaignId) return json({ error: 'campaign_id is required' }, 400);

  try {
    const campaignColumn = campaignKind === 'recruitment' ? 'recruitment_campaign_id' : 'sales_campaign_id';
    const [returnsRes, summaryRes, prospectsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/campaign_returns?${campaignColumn}=eq.${encodeURIComponent(campaignId)}&order=occurred_at.desc&limit=${limit}&select=id,prospect_id,return_type,return_status,return_value_cents,source,occurred_at,notes,properties`,
        { headers: headers() }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/campaign_return_summary?campaign_kind=eq.${campaignKind}&campaign_id=eq.${encodeURIComponent(campaignId)}&select=primary_return_type,return_count,realized_return_count,realized_value_cents,latest_return_at`,
        { headers: headers() }
      ),
      campaignKind === 'recruitment'
        ? fetch(
          `${SUPABASE_URL}/rest/v1/recruitment_prospects?campaign_id=eq.${encodeURIComponent(campaignId)}&order=updated_at.desc.nullslast&limit=${limit}&select=id,name,email,phone,state,city,status,interaction_stage,fit_score,sent_at,updated_at,properties`,
          { headers: headers() }
        )
        : Promise.resolve(null),
    ]);

    if (!returnsRes.ok || !summaryRes.ok || (prospectsRes && !prospectsRes.ok)) {
      throw new Error('Campaign result query failed');
    }

    const [returns, summaries, prospects] = await Promise.all([
      returnsRes.json(),
      summaryRes.json(),
      prospectsRes ? prospectsRes.json() : Promise.resolve([]),
    ]);
    const returnProspectIds = [...new Set(returns.map((campaignReturn: Record<string, unknown>) => campaignReturn.prospect_id).filter(Boolean))];
    const returnProspects = campaignKind === 'recruitment' && returnProspectIds.length > 0
      ? await fetch(
        `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=in.(${returnProspectIds.join(',')})&select=id,name,email,phone,state,city,status,interaction_stage,fit_score,sent_at,updated_at,properties`,
        { headers: headers() }
      ).then(async (response) => response.ok ? response.json() : [])
      : [];
    const prospectById = new Map([...prospects, ...returnProspects].map((prospect: Record<string, unknown>) => [prospect.id, prospect]));
    const returnsWithProspects = returns.map((campaignReturn: Record<string, unknown>) => ({
      ...campaignReturn,
      prospect: campaignReturn.prospect_id ? prospectById.get(campaignReturn.prospect_id) || null : null,
    }));

    return json({
      summary: summaries[0] || {
        primary_return_type: null,
        return_count: 0,
        realized_return_count: 0,
        realized_value_cents: 0,
        latest_return_at: null,
      },
      returns: returnsWithProspects,
      prospects,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to load campaign results' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Database not configured' }, 503);

  try {
    const body = await request.json();
    const campaignKind = body.campaign_kind;
    const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id : '';
    const returnType = body.return_type;
    const returnStatus = body.return_status === undefined ? 'observed' : body.return_status;
    const value = Number(body.return_value_cents ?? 0);

    if (campaignKind !== 'recruitment' && campaignKind !== 'sales') return json({ error: 'Invalid campaign_kind' }, 400);
    if (!campaignId || !isCampaignReturnType(returnType)) return json({ error: 'campaign_id and valid return_type are required' }, 400);
    if (!['observed', 'qualified', 'realized', 'reversed'].includes(returnStatus)) return json({ error: 'Invalid return_status' }, 400);
    if (!Number.isInteger(value) || value < 0) return json({ error: 'return_value_cents must be a non-negative integer' }, 400);

    const record = {
      campaign_kind: campaignKind,
      recruitment_campaign_id: campaignKind === 'recruitment' ? campaignId : null,
      sales_campaign_id: campaignKind === 'sales' ? campaignId : null,
      prospect_id: typeof body.prospect_id === 'string' ? body.prospect_id : null,
      return_type: returnType,
      return_status: returnStatus,
      return_value_cents: value,
      source: 'manual',
      occurred_at: typeof body.occurred_at === 'string' ? body.occurred_at : new Date().toISOString(),
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
      properties: { recorded_by: session.email || 'dashboard' },
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/campaign_returns`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=representation' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`Insert failed: ${res.status}`);
    const [campaignReturn] = await res.json();
    return json({ campaign_return: campaignReturn }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to record campaign return' }, 500);
  }
};