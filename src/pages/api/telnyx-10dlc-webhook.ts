import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * POST /api/telnyx-10dlc-webhook
 *
 * Receives Telnyx messaging webhooks (delivery receipts, opt-out events, etc.)
 * for the Legacy Financial 10DLC campaign. Logs events to Supabase for
 * compliance record-keeping and updates prospect records on delivery failures.
 *
 * Event types we care about:
 * - message.sent        → Telnyx accepted for delivery
 * - message.finalized   → Terminal state (delivered, failed, etc.)
 * - message.received    → Inbound (handled by bridge.js, but logged here too)
 */
export const POST: APIRoute = async ({ request }) => {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Telnyx wraps events in data.event_type / data.payload
  const data = (event.data || {}) as Record<string, unknown>;
  const eventType = String(data.event_type || '');
  const payload = (data.payload || {}) as Record<string, unknown>;

  // Acknowledge immediately — processing is best-effort
  // (Telnyx retries on non-2xx, so always return 200)

  if (!eventType || !payload) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no event_type or payload' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract common fields
  const messageId = String(payload.id || '');
  const from = extractPhone(payload.from);
  const to = extractPhone(payload.to);
  const direction = String(payload.direction || 'outbound');
  const status = String((payload as Record<string, unknown>).status || eventType);
  const errors = (payload.errors || []) as Array<Record<string, unknown>>;
  const completedAt = payload.completed_at || payload.finalized_at || new Date().toISOString();

  // Log to sms_delivery_events table
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/sms_delivery_events`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          message_id: messageId,
          event_type: eventType,
          direction,
          from_number: from,
          to_number: to,
          status,
          error_code: errors[0]?.code || null,
          error_detail: errors[0]?.detail || errors[0]?.title || null,
          raw_payload: payload,
          occurred_at: completedAt,
        }),
      });
    } catch (err) {
      console.error('[telnyx-10dlc-webhook] Failed to log event:', (err as Error).message);
    }

    // On permanent failure, update prospect record (bounce = unusable phone)
    if (eventType === 'message.finalized' && isPermanentFailure(errors)) {
      try {
        const phoneDigits = to.replace(/\D/g, '').slice(-10);
        if (phoneDigits.length === 10) {
          const searchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/recruitment_prospects?phone=ilike.%25${phoneDigits}&status=not.in.(opted_out,rejected)&select=id,properties&limit=3`,
            { headers: supabaseHeaders() },
          );
          const prospects = searchRes.ok ? (await searchRes.json()) as Array<Record<string, unknown>> : [];

          for (const prospect of prospects) {
            const existingProps = (prospect.properties || {}) as Record<string, unknown>;
            await fetch(
              `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(String(prospect.id))}`,
              {
                method: 'PATCH',
                headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
                body: JSON.stringify({
                  updated_at: new Date().toISOString(),
                  properties: {
                    ...existingProps,
                    sms_undeliverable: true,
                    sms_failure_code: errors[0]?.code || 'unknown',
                    sms_failure_at: new Date().toISOString(),
                  },
                }),
              },
            );
          }
        }
      } catch (err) {
        console.error('[telnyx-10dlc-webhook] Failed to update prospect on delivery failure:', (err as Error).message);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, event: eventType }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Also accept GET for Telnyx webhook verification challenges
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true, service: 'telnyx-10dlc-webhook' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

function extractPhone(field: unknown): string {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') {
    const obj = field as Record<string, unknown>;
    return String(obj.phone_number || obj.number || '');
  }
  if (Array.isArray(field) && field.length > 0) {
    return extractPhone(field[0]);
  }
  return '';
}

function isPermanentFailure(errors: Array<Record<string, unknown>>): boolean {
  if (!errors.length) return false;
  const code = String(errors[0].code || '');
  // Telnyx error codes for permanent failures (unreachable, invalid number, etc.)
  const permanentCodes = ['30003', '30005', '30006', '30007', '21610', '21614'];
  return permanentCodes.includes(code);
}
