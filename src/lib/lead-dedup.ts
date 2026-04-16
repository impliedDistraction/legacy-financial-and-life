/**
 * Lead deduplication & anti-spam helpers.
 *
 * Checks Supabase `lead_flow_events` for recent successful submissions
 * matching the same email or phone number within a configurable window
 * (default 30 days). Also provides honeypot and timing-based bot detection.
 */

const DEFAULT_TABLE = 'lead_flow_events';
const DEDUP_WINDOW_DAYS = 30;

// Rate-limit: max quote submissions per IP per hour
const MAX_SUBMISSIONS_PER_IP_PER_HOUR = 5;

// Minimum seconds between page load and submission (bot threshold)
const MIN_FORM_FILL_SECONDS = 3;

// ── Types ───────────────────────────────────────────────────────────

export type DedupResult =
  | { allowed: true }
  | { allowed: false; reason: 'duplicate_email' | 'duplicate_phone' | 'duplicate_email_and_phone' };

export type SpamCheckResult =
  | { passed: true }
  | { passed: false; reason: 'honeypot' | 'too_fast' | 'rate_limited' };

// ── Phone normalization ─────────────────────────────────────────────

/** Strip a phone string to digits only for consistent comparison. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If a US number was entered with leading 1, strip it for comparison
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

// ── Honeypot check ──────────────────────────────────────────────────

/** Returns true if the honeypot field was filled (i.e. likely a bot). */
export function isHoneypotTriggered(data: FormData): boolean {
  const value = String(data.get('website_url') ?? '').trim();
  return value.length > 0;
}

// ── Timing check ────────────────────────────────────────────────────

/** Returns true if the form was submitted suspiciously fast. */
export function isSubmissionTooFast(data: FormData): boolean {
  const rendered = String(data.get('_rendered') ?? '').trim();
  if (!rendered) return false; // If missing, don't block — fail open

  const renderedMs = Number(rendered);
  if (Number.isNaN(renderedMs) || renderedMs <= 0) return false;

  const elapsedSeconds = (Date.now() - renderedMs) / 1000;
  return elapsedSeconds < MIN_FORM_FILL_SECONDS;
}

// ── IP-based rate limiting (via Supabase) ───────────────────────────

export async function isRateLimited(
  clientIp: string,
): Promise<boolean> {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseKey();
  if (!supabaseUrl || !serviceRoleKey) return false; // fail open

  const tableName = getTableName();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    // Count recent submissions from this IP
    const url = new URL(`${supabaseUrl}/rest/v1/${tableName}`);
    url.searchParams.set('select', 'id');
    url.searchParams.set('event_name', 'eq.quote_request_received');
    url.searchParams.set('occurred_at', `gte.${oneHourAgo}`);
    url.searchParams.set('properties->>client_ip', `eq.${clientIp}`);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'count=exact',
        Range: '0-0', // We only need the count header
      },
    });

    const contentRange = res.headers.get('content-range');
    if (!contentRange) return false;

    // content-range looks like "0-0/5" or "*/0"
    const total = Number(contentRange.split('/')[1]);
    return !Number.isNaN(total) && total >= MAX_SUBMISSIONS_PER_IP_PER_HOUR;
  } catch (err) {
    console.error('Rate-limit check failed (allowing request):', err);
    return false; // fail open
  }
}

// ── 30-day dedup check ──────────────────────────────────────────────

/**
 * Check whether a lead with the same email or phone has already
 * successfully submitted a quote in the last 30 days.
 */
export async function checkLeadDedup(
  email: string,
  phone: string,
): Promise<DedupResult> {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseKey();
  if (!supabaseUrl || !serviceRoleKey) return { allowed: true }; // fail open

  const tableName = getTableName();
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);

  let emailDuplicate = false;
  let phoneDuplicate = false;

  try {
    // Check email duplicates
    if (normalizedEmail) {
      const emailUrl = new URL(`${supabaseUrl}/rest/v1/${tableName}`);
      emailUrl.searchParams.set('select', 'id');
      emailUrl.searchParams.set('event_name', 'eq.quote_pipeline_completed');
      emailUrl.searchParams.set('status', 'in.(success,warning)');
      emailUrl.searchParams.set('lead_email', `eq.${normalizedEmail}`);
      emailUrl.searchParams.set('occurred_at', `gte.${cutoff}`);
      emailUrl.searchParams.set('limit', '1');

      const emailRes = await fetch(emailUrl.toString(), {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (emailRes.ok) {
        const rows = await emailRes.json();
        emailDuplicate = Array.isArray(rows) && rows.length > 0;
      }
    }

    // Check phone duplicates
    if (normalizedPhone && normalizedPhone.length >= 7) {
      const phoneUrl = new URL(`${supabaseUrl}/rest/v1/${tableName}`);
      phoneUrl.searchParams.set('select', 'id');
      phoneUrl.searchParams.set('event_name', 'eq.quote_pipeline_completed');
      phoneUrl.searchParams.set('status', 'in.(success,warning)');
      phoneUrl.searchParams.set('lead_phone', `eq.${normalizedPhone}`);
      phoneUrl.searchParams.set('occurred_at', `gte.${cutoff}`);
      phoneUrl.searchParams.set('limit', '1');

      const phoneRes = await fetch(phoneUrl.toString(), {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (phoneRes.ok) {
        const rows = await phoneRes.json();
        phoneDuplicate = Array.isArray(rows) && rows.length > 0;
      }
    }
  } catch (err) {
    console.error('Dedup check failed (allowing request):', err);
    return { allowed: true }; // fail open
  }

  if (emailDuplicate && phoneDuplicate) {
    return { allowed: false, reason: 'duplicate_email_and_phone' };
  }
  if (emailDuplicate) {
    return { allowed: false, reason: 'duplicate_email' };
  }
  if (phoneDuplicate) {
    return { allowed: false, reason: 'duplicate_phone' };
  }

  return { allowed: true };
}

// ── Env helpers (same pattern as lead-analytics.ts) ─────────────────

function getSupabaseUrl(): string | undefined {
  try {
    return (import.meta as any).env?.SUPABASE_URL?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getSupabaseKey(): string | undefined {
  try {
    return (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getTableName(): string {
  try {
    return (import.meta as any).env?.SUPABASE_LEAD_ANALYTICS_TABLE?.trim() || DEFAULT_TABLE;
  } catch {
    return DEFAULT_TABLE;
  }
}
