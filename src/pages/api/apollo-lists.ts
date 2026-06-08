import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const APOLLO_API_KEY = import.meta.env.APOLLO_API_KEY?.trim();
const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const PROSPECTS_TABLE = 'recruitment_prospects';

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supaHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * GET /api/apollo-lists — fetch all saved lists from Apollo
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!APOLLO_API_KEY) return jsonRes({ error: 'Apollo API key not configured' }, 503);

  try {
    const res = await fetch('https://api.apollo.io/api/v1/labels', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'x-api-key': APOLLO_API_KEY,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apollo API ${res.status}: ${text.slice(0, 200)}`);
    }

    const lists: Array<{
      id: string;
      name: string;
      cached_count: number;
      modality: string;
      created_at: string;
    }> = await res.json();

    // Only return people/contacts lists (not companies)
    const peopleLists = lists.filter(l => l.modality === 'contacts');

    return jsonRes({ lists: peopleLists });
  } catch (err) {
    console.error('apollo-lists GET error:', err);
    return jsonRes({ error: 'Failed to fetch Apollo lists' }, 500);
  }
};

/**
 * POST /api/apollo-lists — import contacts from a specific Apollo list
 * Body: { list_id: string, campaign_id?: string }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!APOLLO_API_KEY) return jsonRes({ error: 'Apollo API key not configured' }, 503);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ error: 'Invalid JSON' }, 400);
  }

  const listId = String(body.list_id || '').trim();
  if (!listId || listId.length > 50) {
    return jsonRes({ error: 'list_id required' }, 400);
  }

  const campaignId = body.campaign_id ? String(body.campaign_id).trim() : null;
  const MAX_CONTACTS = 3000; // Supports up to 3000-contact lists
  const BATCH_SIZE = 200; // Insert in batches to avoid payload limits

  try {
    // Paginate through all contacts in the list (100 per page max)
    let allContacts: Array<Record<string, unknown>> = [];
    let page = 1;
    const perPage = 100;
    let totalEntries = 0;

    do {
      const res = await fetch('https://api.apollo.io/api/v1/contacts/search', {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'x-api-key': APOLLO_API_KEY,
        },
        body: JSON.stringify({
          contact_label_ids: [listId],
          per_page: perPage,
          page,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          // Rate limited — return what we have so far or retry hint
          if (allContacts.length > 0) break;
          return jsonRes({ error: `Apollo rate limit hit. Try again in a minute.` }, 429);
        }
        return jsonRes({ error: `Apollo API error ${res.status}: ${text.slice(0, 200)}` }, 502);
      }

      const data = await res.json();
      const contacts = data.contacts || [];
      totalEntries = data.pagination?.total_entries || contacts.length;
      allContacts = allContacts.concat(contacts);
      page++;

      // Small delay to avoid Apollo rate limits
      if (allContacts.length < totalEntries && allContacts.length < MAX_CONTACTS) {
        await new Promise(r => setTimeout(r, 150));
      }
    } while (allContacts.length < totalEntries && allContacts.length < MAX_CONTACTS);

    if (allContacts.length === 0) {
      return jsonRes({ error: 'No contacts found in this list' }, 404);
    }

    // Transform Apollo contacts to our prospect format
    const rows = allContacts.map(c => {
      // Apollo returns both `name` (full) and `first_name`/`last_name` separately
      const name = String(c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '').trim().slice(0, 200);
      const email = String(c.email || '').trim().slice(0, 254).toLowerCase();
      if (!name || !email) return null;

      // Map full state name to abbreviation if needed
      const stateRaw = String(c.state || '').trim();
      const stateAbbr = stateRaw.length === 2 ? stateRaw.toUpperCase() : stateToAbbr(stateRaw);

      return {
        name,
        email,
        state: stateAbbr || null,
        city: String(c.city || '').trim().slice(0, 100) || null,
        current_agency: String(c.organization_name || '').trim().slice(0, 200) || null,
        source: 'apollo_sales_search',
        status: 'new',
        interaction_stage: 'new',
        research_status: 'unscored',
        sales_campaign_id: campaignId,
        properties: {
          apollo_title: String(c.title || '').trim().slice(0, 200) || null,
          apollo_org: String(c.organization_name || '').trim().slice(0, 200) || null,
          linkedin_url: String(c.linkedin_url || '').trim().slice(0, 500) || null,
          apollo_contact_id: String(c.id || ''),
          apollo_list_id: listId,
          email_status: String(c.email_status || ''),
          lead_type: 'sales',
          campaign_type: 'quote_outreach',
        },
        notes: c.title && c.organization_name
          ? `[Apollo List Import] ${String(c.title).trim()} at ${String(c.organization_name).trim()}. Imported from list.`
          : '[Apollo List Import] Imported for quote outreach.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }).filter(Boolean);

    if (rows.length === 0) {
      return jsonRes({ error: 'No contacts with valid name + email found in list' }, 400);
    }

    // Insert in batches to avoid payload size limits
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}`, {
        method: 'POST',
        headers: {
          ...supaHeaders(),
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      });

      if (!insertRes.ok) {
        const err = await insertRes.text();
        // Return partial progress info on failure
        return jsonRes({
          error: `Database insert failed on batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.slice(0, 300)}`,
          partial_imported: totalInserted,
        }, 500);
      }
      totalInserted += batch.length;
    }

    // Update campaign status to 'ready' if it was in 'sourcing' or 'draft'
    if (campaignId) {
      await fetch(`${SUPABASE_URL}/rest/v1/sales_campaigns?id=eq.${campaignId}&status=in.(draft,sourcing)`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'ready' }),
      });
    }

    return jsonRes({
      imported: totalInserted,
      total_in_list: totalEntries,
      campaign_id: campaignId,
      skipped_no_email: allContacts.length - rows.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('apollo-lists POST error:', msg);
    return jsonRes({ error: `Import failed: ${msg.slice(0, 300)}` }, 500);
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────

const STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
};

function stateToAbbr(name: string): string {
  return STATE_MAP[name.toLowerCase()] || name.slice(0, 2).toUpperCase();
}
