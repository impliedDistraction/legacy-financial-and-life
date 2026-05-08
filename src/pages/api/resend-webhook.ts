import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { processResendWebhookEvent } from '../../lib/resend-monitoring';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

  if (eventType === 'email.opened') {
    update.properties = { email_opened_at: new Date().toISOString() };
  } else if (eventType === 'email.clicked') {
    update.properties = { email_clicked_at: new Date().toISOString() };
  } else if (eventType === 'email.bounced') {
    update.status = 'bounced';
    update.properties = { bounced_at: new Date().toISOString(), bounce_type: (data as Record<string, unknown>).bounce_type };
  } else if (eventType === 'email.complained') {
    update.status = 'rejected';
    update.properties = { complained_at: new Date().toISOString(), rejection_reason: 'spam_complaint' };
  } else {
    return; // Don't update for other event types
  }

  try {
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