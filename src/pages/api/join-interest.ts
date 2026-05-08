import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

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

    if (!name || !email || !phone) {
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
