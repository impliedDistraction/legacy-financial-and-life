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
  const eventType = String(event.type || '');

  // ── Inbound reply tracking (email.received) ──────────────────────
  // These don't carry X-Legacy-Prospect-Id since they originate from
  // the prospect, so we match by sender email instead.
  if (eventType === 'email.received') {
    const fromRaw = typeof data.from === 'string' ? data.from : '';
    // Extract bare email from "Name <email>" or plain "email" formats
    const emailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/^([^\s<]+@[^\s>]+)$/);
    const senderEmail = emailMatch?.[1]?.toLowerCase().trim();
    if (!senderEmail) return;

    try {
      // Look up prospect by email
      const lookupRes = await fetch(
        `${SUPABASE_URL}/rest/v1/recruitment_prospects?email=ilike.${encodeURIComponent(senderEmail)}&select=id,properties,interaction_stage&limit=1`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!lookupRes.ok) return;
      const [prospect] = await lookupRes.json();
      if (!prospect) return;

      const existing = prospect.properties || {};
      const currentStage = prospect.interaction_stage || 'new';

      // Build reply preview (truncate to 500 chars)
      const rawText = typeof data.text === 'string' ? data.text : '';
      const subject = typeof data.subject === 'string' ? data.subject : '';
      const replyPreview = rawText.replace(/\s+/g, ' ').trim().slice(0, 500);
      const now = new Date().toISOString();

      // Append to reply history
      const replies = Array.isArray(existing.email_replies) ? existing.email_replies : [];
      replies.push({ at: now, subject, preview: replyPreview });

      const propsPatch: Record<string, unknown> = {
        ...existing,
        email_replied_at: existing.email_replied_at || now, // preserve first reply time
        email_reply_count: (existing.email_reply_count || 0) + 1,
        email_replies: replies,
      };

      // Promote interaction_stage forward only
      const STAGE_ORDER = ['new', 'clicked_cta', 'visited_page', 'interested', 'replied', 'contacted'];
      const currentIdx = STAGE_ORDER.indexOf(currentStage);
      const targetIdx = STAGE_ORDER.indexOf('replied');
      const stageUpdate = targetIdx > currentIdx ? { interaction_stage: 'replied' } : {};

      await fetch(`${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(prospect.id)}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          updated_at: now,
          properties: propsPatch,
          ...stageUpdate,
        }),
      });
    } catch (err) {
      console.error('Failed to track inbound reply to recruitment prospect:', err);
    }
    return;
  }

  // ── Outbound event tracking (opened/clicked/bounced/complained) ──
  const headers = (data.headers || []) as Array<{ name: string; value: string }>;
  const prospectId = headers.find(h => h.name.toLowerCase() === 'x-legacy-prospect-id')?.value;
  const template = headers.find(h => h.name.toLowerCase() === 'x-legacy-template')?.value;
  if (!prospectId || template !== 'recruitment') return;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let propsPatch: Record<string, unknown> = {};

  // Known email security scanner / link-prefetch user agents
  const BOT_UA_PATTERNS = [
    /amazon\s*cloudfront/i, /barracuda/i, /mimecast/i, /proofpoint/i,
    /fireeye/i, /fortinet/i, /symantec/i, /mcafee/i, /microsoft\s*defender/i,
    /google\s*web\s*preview/i, /bot\b/i, /spider\b/i, /crawler\b/i,
    /prefetch/i, /link\s*scanner/i, /security\s*scanner/i,
  ];

  function isBotClick(ua: string | undefined): boolean {
    if (!ua) return false;
    return BOT_UA_PATTERNS.some(p => p.test(ua));
  }

  if (eventType === 'email.opened') {
    propsPatch = { email_opened_at: new Date().toISOString() };
    // Preserve first open timestamp for time-to-open analytics
    propsPatch._preserve_first_open = true;
  } else if (eventType === 'email.clicked') {
    const click = (data.click || data) as Record<string, unknown>;
    const clickedUrl = typeof click.link === 'string' ? click.link : (typeof data.link === 'string' ? data.link : null);
    const clickUserAgent = typeof click.userAgent === 'string' ? click.userAgent : undefined;
    const isBot = isBotClick(clickUserAgent);
    const clickEvent = { url: clickedUrl, at: new Date().toISOString(), userAgent: clickUserAgent || null, bot: isBot };
    propsPatch = {
      email_clicked_at: new Date().toISOString(),
      email_clicked_url: clickedUrl,
      email_clicks: '__APPEND_CLICK__', // placeholder — merged below
      _click_event: clickEvent,
    };

    if (isBot) {
      propsPatch.email_click_bot_detected = true;
    }

    // Classify click intent (only promote interaction_stage for non-bot clicks)
    if (clickedUrl) {
      if (/\/join\b/.test(clickedUrl)) {
        if (!isBot) {
          update._promote_stage = 'clicked_cta';
        } else {
          propsPatch.email_click_bot_cta = true;
        }
      } else if (/\/api\/unsubscribe\b/.test(clickedUrl)) {
        propsPatch.unsubscribe_clicked_at = new Date().toISOString();
      } else if (/not.me|not_me/i.test(clickedUrl)) {
        propsPatch.not_me_clicked_at = new Date().toISOString();
      }
    }
  } else if (eventType === 'email.bounced') {
    const bounceType = String((data as Record<string, unknown>).bounce_type || '');
    update.status = 'bounced';
    propsPatch = { bounced_at: new Date().toISOString(), bounce_type: bounceType };
  } else if (eventType === 'email.complained') {
    update.status = 'opted_out';
    propsPatch = { complained_at: new Date().toISOString(), rejection_reason: 'spam_complaint', opted_out_at: new Date().toISOString(), opted_out_via: 'spam_complaint' };
  } else {
    return; // Don't update for other event types
  }

  try {
    // Fetch existing properties + interaction_stage to merge (avoid overwriting)
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(prospectId)}&select=properties,interaction_stage`,
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
      const existing = row?.properties || {};
      const currentStage = row?.interaction_stage || 'new';

      // Preserve first open timestamp (don't overwrite with later opens)
      if (propsPatch._preserve_first_open && existing.email_opened_at) {
        delete propsPatch.email_opened_at;
      }
      delete propsPatch._preserve_first_open;

      // Only promote interaction_stage forward, never regress
      const STAGE_ORDER = ['new', 'clicked_cta', 'visited_page', 'interested', 'contacted'];
      if (update._promote_stage) {
        const targetStage = update._promote_stage as string;
        const currentIdx = STAGE_ORDER.indexOf(currentStage);
        const targetIdx = STAGE_ORDER.indexOf(targetStage);
        if (targetIdx > currentIdx) {
          update.interaction_stage = targetStage;
        }
        delete update._promote_stage;
      }

      // Build click history array for click events
      if (propsPatch._click_event) {
        const clickEvent = propsPatch._click_event;
        delete propsPatch._click_event;
        delete propsPatch.email_clicks;
        const clicks = Array.isArray(existing.email_clicks) ? existing.email_clicks : [];
        clicks.push(clickEvent);
        propsPatch.email_clicks = clicks;
      }

      update.properties = { ...existing, ...propsPatch };
    } else {
      delete propsPatch._preserve_first_open;
      delete update._promote_stage;
      if (propsPatch._click_event) {
        const clickEvent = propsPatch._click_event;
        delete propsPatch._click_event;
        delete propsPatch.email_clicks;
        propsPatch.email_clicks = [clickEvent];
      }
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

    // Auto-add to Working Order opt-out list on complaints and hard bounces only
    // Soft bounces (mailbox full, temp server issue) are transient and shouldn't opt-out
    const isHardBounce = eventType === 'email.bounced' && (update.properties as Record<string, unknown>)?.bounce_type !== 'soft';
    if (WO_SUPABASE_URL && WO_SUPABASE_SERVICE_ROLE_KEY &&
        (eventType === 'email.complained' || isHardBounce)) {
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

    const alerted = await processResendWebhookEvent(event as { type: string; created_at?: string; data?: Record<string, unknown> }).catch(err => {
      console.error('Resend monitoring error (non-fatal):', err);
      return false;
    });
    return Response.json({ ok: true, type: event.type, alerted });
  } catch (error) {
    console.error('Failed to process Resend webhook event', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
};

export const GET: APIRoute = async () => new Response('Method not allowed', { status: 405 });