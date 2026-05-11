import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const WO_SUPABASE_URL = import.meta.env.WO_SUPABASE_URL?.trim();
const WO_SUPABASE_SERVICE_ROLE_KEY = import.meta.env.WO_SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

/**
 * Log a compliance event to the Working Order coordinator project.
 * This creates an auditable record of TCPA consent, opt-outs, etc.
 */
async function logComplianceEvent(event: {
  prospect_email: string;
  prospect_id: string;
  event_type: string;
  result: string;
  details: Record<string, unknown>;
}) {
  if (!WO_SUPABASE_URL || !WO_SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${WO_SUPABASE_URL}/rest/v1/wo_compliance_events`, {
      method: 'POST',
      headers: {
        apikey: WO_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${WO_SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        ...event,
        client_slug: 'legacy-financial',
      }),
    });
  } catch { /* non-critical — don't break the form submission */ }
}

/**
 * POST /api/join-interest
 * Handles the /join landing page form submission.
 * If a prospectId is provided (from email CTA), updates that prospect with
 * text consent and marks them as "interested". Otherwise creates a new warm lead.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { name, email, phone, state, textConsent, prospectId } = body;

    // When prospectId is present, the form only collects consent (no name/email/phone required)
    if (!prospectId && (!name || !email || !phone)) {
      return new Response(JSON.stringify({ error: 'Name, email, and phone are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Basic input sanitization
    const cleanName = String(name).slice(0, 200).trim();
    const cleanEmail = String(email).slice(0, 200).trim().toLowerCase();
    const cleanPhone = String(phone).slice(0, 30).trim();
    const cleanState = String(state || '').slice(0, 10).trim();

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const now = new Date().toISOString();

    // If prospect ID provided (from email CTA), update existing record
    if (prospectId && typeof prospectId === 'string' && prospectId.length > 10) {
      const fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(prospectId)}&limit=1`,
        { headers }
      );

      if (fetchRes.ok) {
        const [existing] = await fetchRes.json();
        if (existing) {
          const props = existing.properties || {};
          const updateBody = {
            phone: cleanPhone || existing.phone,
            interaction_stage: 'interested',
            last_interaction_at: now,
            properties: {
              ...props,
              text_consent: Boolean(textConsent),
              text_consent_at: textConsent ? now : null,
              text_consent_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
              landing_page_visited_at: now,
              landing_page_state: cleanState,
            },
            updated_at: now,
          };

          const updateRes = await fetch(
            `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(prospectId)}`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=minimal' },
              body: JSON.stringify(updateBody),
            }
          );

          if (updateRes.ok) {
            // Log TCPA consent as a compliance event (auditable record)
            const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
            logComplianceEvent({
              prospect_email: existing.email || cleanEmail,
              prospect_id: prospectId,
              event_type: textConsent ? 'tcpa_consent_granted' : 'interest_submitted',
              result: 'recorded',
              details: {
                source: 'landing_page_form',
                text_consent: Boolean(textConsent),
                consent_timestamp: now,
                client_ip: clientIp,
                user_agent: request.headers.get('user-agent')?.slice(0, 200) || '',
                prospect_name: existing.name || cleanName,
                state: cleanState || existing.state,
              },
            });

            return new Response(JSON.stringify({ success: true, updated: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }
    }

    // No existing prospect matched — create a new warm lead
    const insertBody = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      state: cleanState || null,
      source: 'landing_page',
      status: 'new',
      interaction_stage: 'interested',
      last_interaction_at: now,
      properties: {
        text_consent: Boolean(textConsent),
        text_consent_at: textConsent ? now : null,
        text_consent_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        landing_page_submitted_at: now,
        warm_lead: true,
      },
      created_at: now,
      updated_at: now,
    };

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(insertBody),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text().catch(() => '');
      console.error('Join interest insert failed:', insertRes.status, err);
      return new Response(JSON.stringify({ error: 'Could not save your information' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Log TCPA consent for new warm leads too
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    logComplianceEvent({
      prospect_email: cleanEmail,
      prospect_id: 'new_warm_lead',
      event_type: textConsent ? 'tcpa_consent_granted' : 'interest_submitted',
      result: 'recorded',
      details: {
        source: 'landing_page_form_new',
        text_consent: Boolean(textConsent),
        consent_timestamp: now,
        client_ip: clientIp,
        user_agent: request.headers.get('user-agent')?.slice(0, 200) || '',
        prospect_name: cleanName,
        state: cleanState,
      },
    });

    return new Response(JSON.stringify({ success: true, created: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Join interest error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
