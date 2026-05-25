import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRateLimited } from '../../lib/lead-dedup';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = import.meta.env.RESEND_API_KEY;

// Agents authorized to approve enrollments (email allowlist)
const AUTHORIZED_AGENTS = ['tim@legacyf-l.com', 'beth@legacyf-l.com'];

/**
 * POST /api/enrollment-approve
 *
 * Agent approves or declines a plan selection for enrollment.
 * Sends coordinating email to consumer about the outcome.
 *
 * Body: {
 *   selectionId: string,
 *   sessionId: string,
 *   action: 'approve' | 'decline' | 'flag',
 *   agentEmail: string,
 *   notes?: string,
 *   token: string  // HMAC approval token from the review email
 * }
 */
export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (isRateLimited(`enrollment-approve:${clientIp}`, 20, 60_000)) {
    return jsonResponse(429, { error: 'Too many requests.' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonResponse(503, { error: 'Service unavailable.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  const selectionId = asUUID(body.selectionId);
  const sessionId = asUUID(body.sessionId);
  const action = String(body.action ?? '');
  const agentEmail = String(body.agentEmail ?? '').trim().toLowerCase();
  const notes = String(body.notes ?? '').trim().slice(0, 2000);
  const token = String(body.token ?? '');

  if (!selectionId || !sessionId || !['approve', 'decline', 'flag'].includes(action)) {
    return jsonResponse(400, { error: 'Missing or invalid required fields.' });
  }

  if (!AUTHORIZED_AGENTS.includes(agentEmail)) {
    return jsonResponse(403, { error: 'Unauthorized agent.' });
  }

  // Verify HMAC token (prevents unauthorized approval without the email link)
  const secret = import.meta.env.ENROLLMENT_HMAC_SECRET || import.meta.env.UNSUBSCRIBE_HMAC_SECRET || '';
  const expectedToken = createHmac('sha256', secret)
    .update(`${sessionId}:${selectionId}:${agentEmail}`)
    .digest('hex');

  // Constant-time comparison
  if (!secret || token.length !== expectedToken.length ||
      !timingSafeCompare(token, expectedToken)) {
    return jsonResponse(403, { error: 'Invalid approval token.' });
  }

  // Determine new statuses based on action
  const now = new Date().toISOString();
  let selectionStatus: string;
  let sessionStatus: string;
  let eventType: string;

  switch (action) {
    case 'approve':
      selectionStatus = 'approved';
      sessionStatus = 'approved';
      eventType = 'agent_approved';
      break;
    case 'decline':
      selectionStatus = 'declined';
      sessionStatus = 'declined';
      eventType = 'agent_declined';
      break;
    case 'flag':
      selectionStatus = 'flagged';
      sessionStatus = 'agent_flagged';
      eventType = 'agent_flagged';
      break;
    default:
      return jsonResponse(400, { error: 'Invalid action.' });
  }

  // Update records
  await supabasePatch('plan_selections', selectionId, {
    status: selectionStatus,
    reviewed_by: agentEmail,
    reviewed_at: now,
    review_notes: notes || null,
  });

  await supabasePatch('quote_sessions', sessionId, {
    status: sessionStatus,
  });

  // Record event
  await supabaseInsert('enrollment_events', {
    session_id: sessionId,
    selection_id: selectionId,
    event_type: eventType,
    actor: agentEmail,
    event_data: { action, notes: notes || undefined },
  });

  // Send consumer notification email
  const session = await supabaseGet('quote_sessions', sessionId);
  if (session?.consumer_email && RESEND_KEY) {
    await sendConsumerNotification(session, action, notes);
  }

  return jsonResponse(200, {
    success: true,
    action,
    message: action === 'approve'
      ? 'Enrollment approved. Consumer has been notified.'
      : action === 'decline'
        ? 'Selection declined. Consumer has been notified with next steps.'
        : 'Selection flagged for further review.',
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asUUID(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function supabaseInsert(table: string, record: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(record),
  });
}

async function supabasePatch(table: string, id: string, updates: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
}

async function supabaseGet(table: string, id: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&limit=1`, {
    headers: {
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function sendConsumerNotification(
  session: Record<string, unknown>,
  action: string,
  notes: string
) {
  const { Resend } = await import('resend');
  const resend = new Resend(RESEND_KEY);
  const name = String(session.consumer_name || 'there');

  let subject: string;
  let body: string;

  if (action === 'approve') {
    subject = 'Your plan enrollment has been approved!';
    body = `Hi ${name},\n\nGreat news — a licensed agent has reviewed and approved your plan selection. Your enrollment is being processed.\n\nYou'll receive a confirmation once everything is finalized. If you have any questions in the meantime, reply to this email or call us.\n\nThank you for trusting Legacy Financial & Life with your coverage.\n\n— The Legacy Financial & Life Team`;
  } else if (action === 'decline') {
    subject = 'Update on your plan selection';
    body = `Hi ${name},\n\nAfter reviewing your plan selection, our licensed agent would like to discuss some alternatives that may be a better fit for your needs.${notes ? `\n\nAgent note: ${notes}` : ''}\n\nWe'll be reaching out within 1 business day to walk through your options. No action is needed from you right now.\n\n— The Legacy Financial & Life Team`;
  } else {
    subject = 'Your plan selection is being reviewed';
    body = `Hi ${name},\n\nYour plan selection is undergoing additional review to make sure we get you the best possible coverage.${notes ? `\n\nNote: ${notes}` : ''}\n\nA team member will follow up with you shortly. If you have questions, reply to this email.\n\n— The Legacy Financial & Life Team`;
  }

  await resend.emails.send({
    from: 'Legacy Financial & Life <notifications@legacyfinancial.app>',
    to: String(session.consumer_email),
    subject,
    text: body,
    headers: {
      'X-Legacy-Template': 'enrollment-notification',
      'X-Legacy-Session-Id': String(session.id || ''),
    },
  });
}
