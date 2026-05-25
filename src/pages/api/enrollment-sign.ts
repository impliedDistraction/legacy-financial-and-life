import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { isRateLimited } from '../../lib/lead-dedup';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/enrollment-sign
 *
 * Captures a digital signature for plan enrollment consent.
 * Creates a cryptographic hash of the consent for auditability.
 *
 * Body: {
 *   sessionId: string,
 *   selectionId: string,
 *   signerName: string,
 *   signerEmail: string,
 *   consentText: string,
 *   signatureData: string,  // base64 PNG (drawn) or typed name
 *   signatureType: 'typed' | 'drawn' | 'click'
 * }
 */
export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  // Rate limit: 5 signatures per minute per IP
  if (isRateLimited(`enrollment-sign:${clientIp}`, 5, 60_000)) {
    return jsonResponse(429, { error: 'Too many requests.' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[enrollment-sign] Missing Supabase credentials');
    return jsonResponse(503, { error: 'Service unavailable.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  // Validate required fields
  const sessionId = asUUID(body.sessionId);
  const selectionId = asUUID(body.selectionId);
  const signerName = String(body.signerName ?? '').trim().slice(0, 200);
  const signerEmail = String(body.signerEmail ?? '').trim().toLowerCase().slice(0, 254);
  const consentText = String(body.consentText ?? '').trim().slice(0, 5000);
  const signatureData = String(body.signatureData ?? '').slice(0, 200_000); // base64 PNG or typed name
  const signatureType = (['typed', 'drawn', 'click'].includes(String(body.signatureType)))
    ? String(body.signatureType) : 'typed';

  if (!sessionId || !selectionId || !signerName || !signerEmail || !consentText || !signatureData) {
    return jsonResponse(400, { error: 'Missing required fields: sessionId, selectionId, signerName, signerEmail, consentText, signatureData.' });
  }

  // Build consent hash for tamper detection
  const timestamp = new Date().toISOString();
  const consentHash = createHash('sha256')
    .update(`${consentText}|${signerEmail}|${timestamp}`)
    .digest('hex');

  // Store signature
  const signatureRecord = {
    session_id: sessionId,
    selection_id: selectionId,
    signer_name: signerName,
    signer_email: signerEmail,
    signer_ip: clientIp,
    consent_text: consentText,
    signature_data: signatureData,
    signature_type: signatureType,
    consent_hash: consentHash,
    signed_at: timestamp,
    user_agent: String(request.headers.get('user-agent') ?? '').slice(0, 500),
  };

  const insertRes = await supabaseInsert('enrollment_signatures', signatureRecord);
  if (!insertRes.ok) {
    console.error('[enrollment-sign] DB insert failed:', insertRes.error);
    return jsonResponse(500, { error: 'Failed to record signature.' });
  }

  // Update session and selection status
  const sessionUpdate = await supabaseUpdate('quote_sessions', sessionId, { status: 'pending_approval' });
  const selectionUpdate = await supabaseUpdate('plan_selections', selectionId, { status: 'pending_approval' });

  if (!sessionUpdate || !selectionUpdate) {
    console.error('[enrollment-sign] Failed to update session/selection status');
    return jsonResponse(500, { error: 'Signature recorded but status update failed. Please contact support.' });
  }

  // Record event
  await supabaseInsert('enrollment_events', {
    session_id: sessionId,
    selection_id: selectionId,
    event_type: 'signature_captured',
    actor: 'consumer',
    event_data: { consent_hash: consentHash, signature_type: signatureType },
  });

  // Also fire 'submitted_for_review' event
  await supabaseInsert('enrollment_events', {
    session_id: sessionId,
    selection_id: selectionId,
    event_type: 'submitted_for_review',
    actor: 'system',
    event_data: {},
  });

  return jsonResponse(200, {
    success: true,
    consentHash,
    message: 'Your signature has been recorded. A licensed agent will review your selection and confirm enrollment.',
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

async function supabaseInsert(table: string, record: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status}: ${text}` };
  }
  return { ok: true };
}

async function supabaseUpdate(table: string, id: string, updates: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[enrollment-sign] Update ${table} failed: ${res.status}: ${text}`);
    return false;
  }
  return true;
}
