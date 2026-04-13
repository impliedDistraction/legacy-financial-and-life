import type { APIRoute } from 'astro';
import {
  LEAD_ANALYTICS_OWNER_SCOPES,
  LEAD_ANALYTICS_STAGES,
  LEAD_ANALYTICS_STATUSES,
  getLeadTrackingId,
  trackLeadEvent,
} from '../../lib/lead-analytics';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;

  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response('Invalid JSON payload', { status: 400 });
  }

  const eventName = sanitizeText(body.eventName, 120);
  const route = sanitizeText(body.route, 160);
  const stage = sanitizeEnum(body.stage, LEAD_ANALYTICS_STAGES);
  const status = sanitizeEnum(body.status, LEAD_ANALYTICS_STATUSES);
  const ownerScope = sanitizeEnum(body.ownerScope, LEAD_ANALYTICS_OWNER_SCOPES);
  const source = body.source === 'client' ? 'client' : 'client';

  if (!eventName || !route || !stage || !status || !ownerScope) {
    return new Response('Missing required analytics fields', { status: 400 });
  }

  await trackLeadEvent({
    trackingId: getLeadTrackingId(asOptionalString(body.trackingId)),
    route,
    eventName,
    source,
    stage,
    status,
    ownerScope,
    interest: asOptionalString(body.interest),
    provider: 'vercel_analytics',
    properties: {
      ...asRecord(body.properties),
      pathname: request.headers.get('x-invoke-path') ?? undefined,
      referrer: request.headers.get('referer') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      vercelCountry: request.headers.get('x-vercel-ip-country') ?? undefined,
      vercelRegion: request.headers.get('x-vercel-ip-country-region') ?? undefined,
    },
  });

  return new Response(null, { status: 204 });
};

export const GET: APIRoute = async () => new Response('Method not allowed', { status: 405 });

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && allowed.includes(value as T[number]) ? (value as T[number]) : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}