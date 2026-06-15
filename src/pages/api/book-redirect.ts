import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const CALENDLY_URL = 'https://calendly.com/bethandtim-legacyf-l/30min';

export const GET: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || '';
  const referrer = request.headers.get('referer') || '';

  const url = new URL(request.url);
  const utmSource = url.searchParams.get('utm_source') || undefined;
  const utmMedium = url.searchParams.get('utm_medium') || undefined;
  const utmCampaign = url.searchParams.get('utm_campaign') || undefined;

  // Build Calendly URL preserving any query params for prefill
  const calendlyUrl = new URL(CALENDLY_URL);
  for (const [key, value] of url.searchParams) {
    if (key.startsWith('utm_')) continue; // don't pass UTMs to Calendly
    calendlyUrl.searchParams.set(key, value);
  }

  // Fire-and-forget: don't block the redirect on analytics
  trackLeadEvent({
    route: '/book',
    eventName: 'book_redirect',
    source: 'server',
    stage: 'landing',
    status: 'info',
    ownerScope: 'legacy',
    properties: {
      ip: clientIp,
      userAgent,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
    },
  }).catch(() => {});

  return new Response(null, {
    status: 302,
    headers: {
      Location: calendlyUrl.toString(),
      'Cache-Control': 'no-store',
    },
  });
};
