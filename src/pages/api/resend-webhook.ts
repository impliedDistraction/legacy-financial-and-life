import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { processResendWebhookEvent } from '../../lib/resend-monitoring';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

// Working Order coordinator project (owns the opt-out list)
const WO_SUPABASE_URL = import.meta.env.WO_SUPABASE_URL?.trim();
const WO_SUPABASE_SERVICE_ROLE_KEY = import.meta.env.WO_SUPABASE_SERVICE_ROLE_KEY?.trim();

/**
 * Track recruitment email events (opens, bounces, etc.) back to the prospect record.
 * Identified by X-Legacy-Template: recruitment header set during send.
 */
async function trackRecruitmentEvent(event: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const data = (event.data || {}) as Record<string, unknown>;
  const headers = (data.headers || []) as Array<{ name: string; value: string }>;
  const prospectId = headers.find(h => h.name === 'X-Legacy-Prospect-Id')?.value;
  const template = headers.find(h => h.name === 'X-Legacy-Template')?.value;
  if (!prospectId || template !== 'recruitment') return;

  const eventType = String(event.type || '');
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let propsPatch: Record<string, unknown> = {};

  if (eventType === 'email.opened') {
    propsPatch = { email_opened_at: new Date().toISOString() };
  } else if (eventType === 'email.clicked') {
    propsPatch = { email_clicked_at: new Date().toISOString() };
  } else if (eventType === 'email.bounced') {
    update.status = 'bounced';
    propsPatch = { bounced_at: new Date().toISOString(), bounce_type: (data as Record<string, unknown>).bounce_type };
  } else if (eventType === 'email.complained') {
    update.status = 'opted_out';
    propsPatch = { complained_at: new Date().toISOString(), rejection_reason: 'spam_complaint', opted_out_at: new Date().toISOString(), opted_out_via: 'spam_complaint' };
  } else {
    return; // Don't update for other event types
  }

  try {
    // Fetch existing properties to merge (avoid overwriting)
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(prospectId)}&select=properties`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (existingRes.ok) {
      const [row] = await existingRes.json();
      update.properties = { ...(row?.properties || {}), ...propsPatch };
    } else {
      update.properties = propsPatch;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(prospectId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(update),
    });

    // Auto-add to Working Order opt-out list on complaints and hard bounces
    if (WO_SUPABASE_URL && WO_SUPABASE_SERVICE_ROLE_KEY &&
        (eventType === 'email.complained' || eventType === 'email.bounced')) {
      // Fetch prospect email for opt-out list
      const prospectRes = await fetch(
        `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(prospectId)}&select=email,phone&limit=1`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (prospectRes.ok) {
        const [prospect] = await prospectRes.json();
        if (prospect?.email) {
          const source = eventType === 'email.complained' ? 'spam_complaint' : 'bounce';
          // Add to opt-out list
          await fetch(`${WO_SUPABASE_URL}/rest/v1/wo_opt_out_list`, {
            method: 'POST',
            headers: {
              apikey: WO_SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${WO_SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              email: prospect.email.toLowerCase().trim(),
              phone: prospect.phone || null,
              source,
              client_slug: 'legacy-financial',
              prospect_id: prospectId,
              reason: eventType === 'email.complained' ? 'Spam complaint via Resend webhook' : 'Hard bounce via Resend webhook',
            }),
          }).catch(() => {});

          // Log compliance event
          await fetch(`${WO_SUPABASE_URL}/rest/v1/wo_compliance_events`, {
            method: 'POST',
            headers: {
              apikey: WO_SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${WO_SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              prospect_email: prospect.email.toLowerCase().trim(),
              prospect_id: prospectId,
              client_slug: 'legacy-financial',
              event_type: source === 'spam_complaint' ? 'complaint_received' : 'bounce_received',
              result: 'recorded',
              details: { webhook_event: eventType, timestamp: new Date().toISOString() },
            }),
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('Failed to update recruitment prospect from webhook:', err);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = import.meta.env.RESEND_WEBHOOK_SECRET
    || import.meta.env.RESEND_LEGACY_FINANCIAL_WEBHOOK_SIGNING_SECRET;
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET / RESEND_LEGACY_FINANCIAL_WEBHOOK_SIGNING_SECRET not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing webhook signature headers', { status: 400 });
  }

  const payload = await request.text();
  const webhook = new Webhook(webhookSecret);

  let event;
  try {
    event = webhook.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (error) {
    console.error('Invalid Resend webhook signature', error);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    // Track recruitment email events (opens/bounces/clicks) back to prospect records
    await trackRecruitmentEvent(event as Record<string, unknown>).catch(err => {
      console.error('Recruitment tracking error (non-fatal):', err);
    });

    const alerted = await processResendWebhookEvent(event as { type: string; created_at?: string; data?: Record<string, unknown> });
    return Response.json({ ok: true, type: event.type, alerted });
  } catch (error) {
    console.error('Failed to process Resend webhook event', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
};

export const GET: APIRoute = async () => new Response('Method not allowed', { status: 405 });