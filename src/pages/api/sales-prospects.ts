import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

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
 * GET /api/sales-prospects — list sales prospects with filtering
 * Query params: campaign_id, status, page, limit
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaign_id');
  const status = url.searchParams.get('status');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)));
  const offset = (page - 1) * limit;

  try {
    const filters = ['source=eq.apollo_sales_search'];

    if (campaignId === 'unassigned') {
      filters.push('sales_campaign_id=is.null');
    } else if (campaignId) {
      filters.push(`sales_campaign_id=eq.${campaignId}`);
    }

    if (status) {
      filters.push(`status=eq.${status}`);
    }

    const select = 'id,name,email,state,city,current_agency,status,interaction_stage,sent_at,properties,notes,sales_campaign_id,created_at';
    const queryStr = `${filters.join('&')}&select=${select}&order=created_at.desc&limit=${limit}&offset=${offset}`;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${queryStr}`,
      { headers: { ...supaHeaders(), Prefer: 'count=exact' } }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);

    const prospects = await res.json();
    const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);

    return jsonRes({ prospects, total, page, limit });
  } catch (err) {
    console.error('sales-prospects GET error:', err);
    return jsonRes({ error: 'Failed to fetch prospects' }, 500);
  }
};

/**
 * POST /api/sales-prospects — upload CSV of Apollo leads
 * Body: { prospects: Array<{name, email, title, company, state, city, linkedinUrl}>, campaign_id? }
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

  const prospects = body.prospects;
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return jsonRes({ error: 'prospects array required' }, 400);
  }
  if (prospects.length > 500) {
    return jsonRes({ error: 'Maximum 500 prospects per upload' }, 400);
  }

  const campaignId = body.campaign_id ? String(body.campaign_id) : null;

  try {
    const rows = prospects.map((p: Record<string, unknown>) => {
      const name = String(p.name || '').trim().slice(0, 200);
      const email = String(p.email || '').trim().slice(0, 254).toLowerCase();
      if (!name || !email) return null;

      return {
        name,
        email,
        state: String(p.state || '').trim().slice(0, 2) || null,
        city: String(p.city || '').trim().slice(0, 100) || null,
        current_agency: String(p.company || '').trim().slice(0, 200) || null,
        source: 'apollo_sales_search',
        status: 'new',
        interaction_stage: 'new',
        research_status: 'unscored',
        sales_campaign_id: campaignId,
        properties: {
          apollo_title: String(p.title || '').trim().slice(0, 200) || null,
          apollo_org: String(p.company || '').trim().slice(0, 200) || null,
          linkedin_url: String(p.linkedinUrl || p.linkedin_url || '').trim().slice(0, 500) || null,
          lead_type: 'sales',
          campaign_type: 'quote_outreach',
        },
        notes: p.title && p.company
          ? `[Apollo Sales Lead] ${String(p.title).trim()} at ${String(p.company).trim()}. Target for quote outreach via PlanEnroll.`
          : '[Apollo Sales Lead] Imported for quote outreach.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }).filter(Boolean);

    if (rows.length === 0) {
      return jsonRes({ error: 'No valid prospects in upload (name + email required)' }, 400);
    }

    // Upsert — skip duplicates on email
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        ...supaHeaders(),
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(rows),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Insert failed: ${res.status} — ${err}`);
    }

    // Update campaign status to 'ready' if it was in 'sourcing'
    if (campaignId) {
      await fetch(`${SUPABASE_URL}/rest/v1/sales_campaigns?id=eq.${campaignId}&status=eq.sourcing`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'ready' }),
      });
    }

    return jsonRes({ imported: rows.length, campaign_id: campaignId });
  } catch (err) {
    console.error('sales-prospects POST error:', err);
    return jsonRes({ error: 'Upload failed' }, 500);
  }
};
