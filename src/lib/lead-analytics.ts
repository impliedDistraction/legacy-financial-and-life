type LeadAnalyticsSource = 'client' | 'server' | 'webhook';
type LeadAnalyticsStage = 'landing' | 'form' | 'submission' | 'contact_sync' | 'email' | 'webhook' | 'handoff' | 'error';
type LeadAnalyticsStatus = 'info' | 'success' | 'warning' | 'error';
type LeadAnalyticsOwnerScope = 'legacy' | 'handoff' | 'client' | 'external';

export const LEAD_ANALYTICS_STAGES = [
  'landing',
  'form',
  'submission',
  'contact_sync',
  'email',
  'webhook',
  'handoff',
  'error',
] as const;

export const LEAD_ANALYTICS_STATUSES = ['info', 'success', 'warning', 'error'] as const;
export const LEAD_ANALYTICS_OWNER_SCOPES = ['legacy', 'handoff', 'client', 'external'] as const;

type LeadAnalyticsEventInput = {
  trackingId?: string;
  route: string;
  eventName: string;
  source: LeadAnalyticsSource;
  stage: LeadAnalyticsStage;
  status: LeadAnalyticsStatus;
  ownerScope: LeadAnalyticsOwnerScope;
  leadEmail?: string;
  leadPhone?: string;
  interest?: string;
  provider?: string;
  occurredAt?: string;
  properties?: Record<string, unknown>;
};

type LeadAnalyticsRecord = {
  tracking_id: string;
  route: string;
  event_name: string;
  source: LeadAnalyticsSource;
  stage: LeadAnalyticsStage;
  status: LeadAnalyticsStatus;
  owner_scope: LeadAnalyticsOwnerScope;
  lead_email?: string;
  lead_phone?: string;
  interest?: string;
  provider?: string;
  occurred_at: string;
  properties: Record<string, unknown>;
};

const DEFAULT_LEAD_ANALYTICS_TABLE = 'lead_flow_events';

export function getLeadTrackingId(value?: FormDataEntryValue | string | null): string {
  const candidate = typeof value === 'string' ? value.trim() : '';

  if (candidate && /^[A-Za-z0-9_-]{8,120}$/.test(candidate)) {
    return candidate;
  }

  return crypto.randomUUID();
}

export async function trackLeadEvent(input: LeadAnalyticsEventInput): Promise<boolean> {
  const supabaseUrl = import.meta.env.SUPABASE_URL?.trim();
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const tableName = import.meta.env.SUPABASE_LEAD_ANALYTICS_TABLE?.trim() || DEFAULT_LEAD_ANALYTICS_TABLE;

  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  const payload: LeadAnalyticsRecord = {
    tracking_id: getLeadTrackingId(input.trackingId),
    route: sanitizeText(input.route, 160) || '/unknown',
    event_name: sanitizeText(input.eventName, 120) || 'unknown_event',
    source: input.source,
    stage: input.stage,
    status: input.status,
    owner_scope: input.ownerScope,
    lead_email: normalizeEmail(input.leadEmail),
    lead_phone: sanitizeText(input.leadPhone, 40) || undefined,
    interest: sanitizeText(input.interest, 80) || undefined,
    provider: sanitizeText(input.provider, 80) || undefined,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    properties: sanitizeProperties(input.properties),
  };

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([payload]),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('Supabase lead analytics write failed', {
        status: response.status,
        body,
        eventName: payload.event_name,
        route: payload.route,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Supabase lead analytics request failed', error);
    return false;
  }
}

function sanitizeProperties(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [sanitizeKey(key), sanitizePropertyValue(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);

  return Object.fromEntries(entries);
}

function sanitizePropertyValue(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeText(value, 2000);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizePropertyValue(entry))
      .filter((entry) => entry !== undefined)
      .slice(0, 50);
  }

  if (value && typeof value === 'object') {
    const nestedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => [sanitizeKey(key), sanitizePropertyValue(nestedValue)] as const)
      .filter(([, nestedValue]) => nestedValue !== undefined);

    return Object.fromEntries(nestedEntries);
  }

  return undefined;
}

function sanitizeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80) || 'unknown';
}

function sanitizeText(value: string | undefined, maxLength: number): string {
  return (value ?? '').trim().slice(0, maxLength);
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = sanitizeText(value, 320).toLowerCase();
  return normalized || undefined;
}