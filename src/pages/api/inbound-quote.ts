import type { APIRoute } from 'astro';
import { Webhook } from 'svix';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const WEBHOOK_SECRET = import.meta.env.RESEND_QUOTE_WEBHOOK_SECRET?.trim() || import.meta.env.RESEND_WEBHOOK_SECRET?.trim();

// Rate limiting: max 5 inbound emails per sender per hour
const senderRateMap = new Map<string, { count: number; resetAt: number }>();

function checkSenderRate(email: string): boolean {
  const now = Date.now();
  const entry = senderRateMap.get(email);
  if (!entry || now > entry.resetAt) {
    senderRateMap.set(email, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 5;
}

/**
 * POST /api/inbound-quote
 *
 * Receives inbound emails from Resend (sent to quotes@legacyfinancial.app).
 * Creates a quote_thread record and queues for AI processing by Sentinel.
 *
 * Resend Inbound Webhook payload (email.received):
 * {
 *   type: 'email.received',
 *   data: {
 *     from: 'Name <email@example.com>',
 *     to: ['quotes@legacyfinancial.app'],
 *     subject: '...',
 *     text: '...',
 *     html: '...',
 *     headers: [...],
 *     created_at: '...'
 *   }
 * }
 */
export const POST: APIRoute = async ({ request }) => {
  // ─── Verify webhook signature ──────────────────────────────────
  if (!WEBHOOK_SECRET) {
    console.error('[inbound-quote] No webhook secret configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const body = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing signature headers', { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as Record<string, unknown>;
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  // ─── Only handle email.received events ─────────────────────────
  if (event.type !== 'email.received') {
    return new Response('Ignored event type', { status: 200 });
  }

  const data = (event.data || {}) as Record<string, unknown>;

  // ─── Verify this email was sent to the quotes address ──────────
  const QUOTE_ADDRESS = (import.meta.env.QUOTE_INBOUND_ADDRESS || 'quotes@legacyfinancial.app').toLowerCase();
  const toField = data.to;
  const toAddresses: string[] = Array.isArray(toField)
    ? toField.map((t: unknown) => String(t).toLowerCase())
    : typeof toField === 'string' ? [toField.toLowerCase()] : [];

  const isForQuotes = toAddresses.some(addr =>
    addr.includes(QUOTE_ADDRESS) || addr.includes('quotes@')
  );

  if (!isForQuotes) {
    // Not addressed to quotes@ — ignore (another webhook handles it)
    return new Response('Not a quote request', { status: 200 });
  }

  // ─── Extract sender email ─────────────────────────────────────
  const fromRaw = typeof data.from === 'string' ? data.from : '';
  const emailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/^([^\s<]+@[^\s>]+)$/);
  const senderEmail = emailMatch?.[1]?.toLowerCase().trim();

  if (!senderEmail) {
    return new Response('Could not parse sender', { status: 200 });
  }

  // ─── Rate limiting ─────────────────────────────────────────────
  if (!checkSenderRate(senderEmail)) {
    console.warn(`[inbound-quote] Rate limit exceeded for ${senderEmail}`);
    return new Response('Rate limited', { status: 200 });
  }

  // ─── Extract email content ─────────────────────────────────────
  const subject = typeof data.subject === 'string' ? data.subject.slice(0, 500) : '';
  const textBody = typeof data.text === 'string' ? data.text.slice(0, 10_000) : '';
  const senderName = fromRaw.match(/^([^<]+)\s*</) ? fromRaw.match(/^([^<]+)\s*</)?.[1]?.trim() || null : null;

  // ─── Check for existing active thread from this sender ─────────
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[inbound-quote] Missing Supabase config');
    return new Response('Server misconfigured', { status: 500 });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Check for existing open thread from this sender
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quote_threads?sender_email=eq.${encodeURIComponent(senderEmail)}&status=in.(new,extracting,awaiting_info,recommending)&order=created_at.desc&limit=1`,
    { headers }
  );

  const now = new Date().toISOString();
  const messageEntry = { role: 'consumer', content: textBody, subject, at: now };

  if (existingRes.ok) {
    const existing = await existingRes.json();

    if (existing.length > 0) {
      // Append to existing thread
      const thread = existing[0];
      const messages = Array.isArray(thread.messages) ? thread.messages : [];
      messages.push(messageEntry);

      await fetch(
        `${SUPABASE_URL}/rest/v1/quote_threads?id=eq.${thread.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            messages,
            message_count: messages.length,
            last_consumer_reply_at: now,
            // Reset to new if was awaiting info (worker will reprocess)
            status: thread.status === 'awaiting_info' ? 'new' : thread.status,
          }),
        }
      );

      console.log(`[inbound-quote] Appended to thread ${thread.id} from ${senderEmail}`);
      return new Response(JSON.stringify({ threadId: thread.id, action: 'appended' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ─── Get usage count for this sender ───────────────────────────
  const usageRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quote_usage?sender_email=eq.${encodeURIComponent(senderEmail)}&limit=1`,
    { headers }
  );

  let usageNumber = 1;
  let tier = 'free';
  let blocked = false;

  if (usageRes.ok) {
    const [usage] = await usageRes.json();
    if (usage) {
      usageNumber = (usage.completed_count || 0) + (usage.active_threads || 0) + 1;
      tier = usage.tier || 'free';

      // Check if blocked
      if (usage.blocked_at) {
        blocked = true;
      }

      // Check free tier limit
      const freeLimit = 2;
      if (tier === 'free' && usage.completed_count >= freeLimit) {
        blocked = true;
      }

      // Update usage record
      await fetch(
        `${SUPABASE_URL}/rest/v1/quote_usage?sender_email=eq.${encodeURIComponent(senderEmail)}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            active_threads: (usage.active_threads || 0) + 1,
            last_request_at: now,
          }),
        }
      );
    } else {
      // First request from this sender — create usage record
      await fetch(
        `${SUPABASE_URL}/rest/v1/quote_usage`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            sender_email: senderEmail,
            completed_count: 0,
            active_threads: 1,
            tier: 'free',
            first_request_at: now,
            last_request_at: now,
          }),
        }
      );
    }
  }

  // ─── Create new quote thread ───────────────────────────────────
  const threadData = {
    sender_email: senderEmail,
    sender_name: senderName,
    thread_subject: subject,
    status: blocked ? 'blocked' : 'new',
    messages: [messageEntry],
    message_count: 1,
    usage_number: usageNumber,
    last_consumer_reply_at: now,
  };

  const createRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quote_threads`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(threadData),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error(`[inbound-quote] Failed to create thread: ${err}`);
    return new Response('Database error', { status: 500 });
  }

  const [created] = await createRes.json();
  console.log(`[inbound-quote] Created thread ${created.id} from ${senderEmail} (usage #${usageNumber}, tier: ${tier}, blocked: ${blocked})`);

  return new Response(JSON.stringify({ threadId: created.id, action: 'created', blocked }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
