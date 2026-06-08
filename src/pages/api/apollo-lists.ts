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

    // Check which lists are cached locally
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const cacheRes = await fetch(
        `${SUPABASE_URL}/rest/v1/apollo_list_cache?select=list_id,contact_count,fetched_at`,
        { headers: supaHeaders() },
      );
      if (cacheRes.ok) {
        const cached: Array<{ list_id: string; contact_count: number; fetched_at: string }> = await cacheRes.json();
        const cacheMap = new Map(cached.map(c => [c.list_id, c]));
        for (const list of peopleLists) {
          const c = cacheMap.get(list.id);
          if (c) {
            (list as any).cached = true;
            (list as any).cached_contacts = c.contact_count;
            (list as any).cached_at = c.fetched_at;
          }
        }
      }
    }

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
  const MAX_CONTACTS = 3000;
  const BATCH_SIZE = 200;

  try {
    // ─── Step 1: Check cache first, else fetch from Apollo ───────────
    let allContacts: Array<Record<string, unknown>> = [];

    const cacheRes = await fetch(
      `${SUPABASE_URL}/rest/v1/apollo_list_cache?list_id=eq.${listId}&select=contacts,fetched_at`,
      { headers: supaHeaders() },
    );
    const cacheData = cacheRes.ok ? await cacheRes.json() : [];
    const cached = cacheData[0];

    if (cached?.contacts?.length > 0) {
      // Use cached data (skip Apollo API entirely)
      allContacts = cached.contacts;
    } else {
      // Fetch from Apollo and cache the result
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
            if (allContacts.length > 0) break;
            return jsonRes({ error: 'Apollo rate limit hit. Try again in a minute.' }, 429);
          }
          return jsonRes({ error: `Apollo API error ${res.status}: ${text.slice(0, 200)}` }, 502);
        }

        const data = await res.json();
        const contacts = data.contacts || [];
        totalEntries = data.pagination?.total_entries || contacts.length;
        allContacts = allContacts.concat(contacts);
        page++;

        // Throttle to avoid Apollo rate limits
        if (allContacts.length < totalEntries && allContacts.length < MAX_CONTACTS) {
          await new Promise(r => setTimeout(r, 150));
        }
      } while (allContacts.length < totalEntries && allContacts.length < MAX_CONTACTS);

      // Persist to cache (upsert by list_id)
      if (allContacts.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/apollo_list_cache`, {
          method: 'POST',
          headers: { ...supaHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify({
            list_id: listId,
            list_name: allContacts[0]?.label_ids ? listId : listId, // name populated by GET
            contact_count: allContacts.length,
            contacts: allContacts,
            fetched_at: new Date().toISOString(),
          }),
        }).catch(() => {}); // non-critical — import proceeds even if cache write fails
      }
    }

    if (allContacts.length === 0) {
      return jsonRes({ error: 'No contacts found in this list' }, 404);
    }

    // ─── Step 2: Transform contacts to prospect format ──────────────
    const rows = allContacts.map(c => {
      const name = String(c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '').trim().slice(0, 200);
      const email = String(c.email || '').trim().slice(0, 254).toLowerCase();
      if (!name || !email) return null;

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
    }).filter(Boolean) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return jsonRes({ error: 'No contacts with valid name + email found in list' }, 400);
    }

    // ─── Step 3: Insert via RPC (ON CONFLICT DO NOTHING) ────────────
    // Uses import_prospects_bulk() which handles the partial unique index
    // on lower(email) that PostgREST's Prefer header cannot handle.
    let totalInserted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/import_prospects_bulk`, {
        method: 'POST',
        headers: supaHeaders(),
        body: JSON.stringify({ rows: batch }),
      });

      if (!rpcRes.ok) {
        const err = await rpcRes.text();
        // If RPC doesn't exist yet, fall back to direct insert with best-effort dedup
        if (err.includes('import_prospects_bulk') || err.includes('PGRST202')) {
          // Fallback: direct insert, skip entire batch on constraint error
          const fallbackRes = await fetch(`${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}`, {
            method: 'POST',
            headers: { ...supaHeaders(), Prefer: 'return=minimal' },
            body: JSON.stringify(batch),
          });
          if (fallbackRes.ok) {
            totalInserted += batch.length;
          } else {
            // Constraint error — insert one by one
            for (const row of batch) {
              const singleRes = await fetch(`${SUPABASE_URL}/rest/v1/${PROSPECTS_TABLE}`, {
                method: 'POST',
                headers: { ...supaHeaders(), Prefer: 'return=minimal' },
                body: JSON.stringify([row]),
              });
              if (singleRes.ok) totalInserted++;
              else totalSkipped++;
            }
          }
        } else {
          return jsonRes({
            error: `Database insert failed on batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.slice(0, 300)}`,
            partial_imported: totalInserted,
          }, 500);
        }
        continue;
      }

      const result = await rpcRes.json();
      totalInserted += result.inserted || 0;
      totalSkipped += result.skipped || 0;
    }

    // ─── Step 4: Update campaign status ─────────────────────────────
    if (campaignId) {
      await fetch(`${SUPABASE_URL}/rest/v1/sales_campaigns?id=eq.${campaignId}&status=in.(draft,sourcing)`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'ready' }),
      });
    }

    return jsonRes({
      imported: totalInserted,
      total_in_list: allContacts.length,
      campaign_id: campaignId,
      skipped_no_email: allContacts.length - rows.length,
      skipped_duplicates: totalSkipped,
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
