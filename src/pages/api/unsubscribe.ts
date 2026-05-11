import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

// Working Order coordinator project (owns the opt-out list)
const WO_SUPABASE_URL = import.meta.env.WO_SUPABASE_URL?.trim();
const WO_SUPABASE_SERVICE_ROLE_KEY = import.meta.env.WO_SUPABASE_SERVICE_ROLE_KEY?.trim();

// HMAC secret — must match what sentinel uses (OPENCLAW_SECRET fallback)
const HMAC_SECRET = import.meta.env.UNSUBSCRIBE_HMAC_SECRET?.trim()
  || import.meta.env.OPENCLAW_SECRET?.trim()
  || '';

const TABLE = 'recruitment_prospects';

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyToken(prospectId: string, token: string): Promise<boolean> {
  if (!HMAC_SECRET || !token || !prospectId) return false;
  const expected = await hmacHex(HMAC_SECRET, prospectId);
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

function supabaseHeaders(url: string, key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * GET /api/unsubscribe?pid={prospectId}&token={hmac}
 *
 * One-click unsubscribe endpoint. Validates HMAC token, marks prospect as
 * opted out in Legacy Financial DB, and inserts into Working Order's global
 * opt-out list. Redirects to confirmation page.
 */
export const GET: APIRoute = async ({ url, redirect }) => {
  const pid = url.searchParams.get('pid');
  const token = url.searchParams.get('token');

  if (!pid || !token) {
    return redirect('/unsubscribe-error');
  }

  if (!(await verifyToken(pid, token))) {
    return redirect('/unsubscribe-error');
  }

  const now = new Date().toISOString();

  // 1. Mark prospect as opted_out in Legacy Financial Supabase
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      // Fetch the prospect to get their email for the opt-out list
      const fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(pid)}&select=email,phone,name,properties&limit=1`,
        { headers: supabaseHeaders(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) }
      );

      let prospectEmail = '';
      let prospectPhone = '';
      let existingProps: Record<string, unknown> = {};

      if (fetchRes.ok) {
        const [prospect] = await fetchRes.json();
        if (prospect) {
          prospectEmail = prospect.email || '';
          prospectPhone = prospect.phone || '';
          existingProps = prospect.properties || {};
        }
      }

      // Update prospect status to opted_out
      await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(pid)}`,
        {
          method: 'PATCH',
          headers: { ...supabaseHeaders(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'opted_out',
            updated_at: now,
            properties: {
              ...existingProps,
              opted_out_at: now,
              opted_out_via: 'unsubscribe_link',
            },
          }),
        }
      );

      // 2. Insert into Working Order global opt-out list
      if (WO_SUPABASE_URL && WO_SUPABASE_SERVICE_ROLE_KEY && prospectEmail) {
        await fetch(
          `${WO_SUPABASE_URL}/rest/v1/wo_opt_out_list`,
          {
            method: 'POST',
            headers: { ...supabaseHeaders(WO_SUPABASE_URL, WO_SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
            body: JSON.stringify({
              email: prospectEmail.toLowerCase().trim(),
              phone: prospectPhone || null,
              source: 'unsubscribe_link',
              client_slug: 'legacy-financial',
              prospect_id: pid,
              reason: 'Clicked unsubscribe link in recruitment email',
            }),
          }
        ).catch(err => console.error('Failed to add to WO opt-out list:', err));

        // 3. Log compliance event
        await fetch(
          `${WO_SUPABASE_URL}/rest/v1/wo_compliance_events`,
          {
            method: 'POST',
            headers: { ...supabaseHeaders(WO_SUPABASE_URL, WO_SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=minimal' },
            body: JSON.stringify({
              prospect_email: prospectEmail.toLowerCase().trim(),
              prospect_id: pid,
              client_slug: 'legacy-financial',
              event_type: 'opt_out_added',
              result: 'recorded',
              details: { source: 'unsubscribe_link', timestamp: now },
            }),
          }
        ).catch(err => console.error('Failed to log compliance event:', err));
      }
    } catch (err) {
      console.error('Unsubscribe processing error:', err);
    }
  }

  return redirect('/unsubscribe-success');
};
