import { track } from '@vercel/analytics';

type QuoteAnalyticsOptions = {
  eventName: string;
  route: string;
  stage: 'landing' | 'form' | 'submission' | 'handoff' | 'error';
  status: 'info' | 'success' | 'warning' | 'error';
  ownerScope: 'legacy' | 'handoff' | 'client' | 'external';
  interest?: string;
  properties?: Record<string, string>;
};

const TRACKING_ID_KEY = 'quote_tracking_id';
const TRACKING_ID_CONSUMED_KEY = 'quote_tracking_id_consumed';
const QUOTE_INTEREST_KEY = 'quote_interest';
const QUOTE_ATTRIBUTION_KEY = 'quote_attribution';

const ATTRIBUTION_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
] as const;

type QuoteAttribution = Record<string, string>;

export function prepareQuoteTrackingId(): string {
  const existingId = sessionStorage.getItem(TRACKING_ID_KEY);
  const consumed = sessionStorage.getItem(TRACKING_ID_CONSUMED_KEY) === 'true';

  if (!existingId || consumed) {
    const nextId = crypto.randomUUID();
    sessionStorage.setItem(TRACKING_ID_KEY, nextId);
    sessionStorage.removeItem(TRACKING_ID_CONSUMED_KEY);
    sessionStorage.removeItem('quote_page_view_tracked');
    sessionStorage.removeItem('quote_form_started_tracked');
    sessionStorage.removeItem('quote_success_tracked');
    sessionStorage.removeItem('quote_error_tracked');
    return nextId;
  }

  return existingId;
}

export function getQuoteTrackingId(): string {
  return prepareQuoteTrackingId();
}

export function markQuoteTrackingIdConsumed(): void {
  sessionStorage.setItem(TRACKING_ID_CONSUMED_KEY, 'true');
}

export function setQuoteInterest(value: string): void {
  sessionStorage.setItem(QUOTE_INTEREST_KEY, value);
}

export function getQuoteInterest(): string {
  return sessionStorage.getItem(QUOTE_INTEREST_KEY) ?? 'unknown';
}

export function captureQuoteAttribution(): QuoteAttribution {
  const stored = readStoredAttribution();
  const url = new URL(window.location.href);
  const next: QuoteAttribution = {
    ...stored,
    landing_path: stored.landing_path || window.location.pathname,
    landing_url: stored.landing_url || truncate(url.toString(), 500),
  };

  const referrer = document.referrer.trim();
  if (referrer) {
    next.referrer = stored.referrer || truncate(referrer, 500);
    next.referrer_host = stored.referrer_host || getHost(referrer);
  }

  ATTRIBUTION_QUERY_KEYS.forEach((key) => {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      next[key] = truncate(value, 300);
    }
  });

  next.attribution_source = resolveAttributionSource(next);
  next.campaign_key = buildCampaignKey(next);

  sessionStorage.setItem(QUOTE_ATTRIBUTION_KEY, JSON.stringify(next));
  return next;
}

export function applyQuoteAttributionToForm(form: HTMLFormElement): void {
  const attribution = captureQuoteAttribution();

  Object.entries(attribution).forEach(([key, value]) => {
    const input = form.querySelector(`input[name="${key}"]`) as HTMLInputElement | null;
    if (input) {
      input.value = value;
    }
  });
}

export function trackQuoteAnalyticsEvent(options: QuoteAnalyticsOptions): void {
  const trackingId = getQuoteTrackingId();
  const attribution = captureQuoteAttribution();
  const properties = {
    tracking_id: trackingId,
    route: options.route,
    stage: options.stage,
    status: options.status,
    owner_scope: options.ownerScope,
    ...(options.interest ? { interest: options.interest } : {}),
    ...attribution,
    ...(options.properties ?? {}),
  };

  track(options.eventName, properties);

  const payload = JSON.stringify({
    trackingId,
    eventName: options.eventName,
    route: options.route,
    stage: options.stage,
    status: options.status,
    ownerScope: options.ownerScope,
    interest: options.interest,
    properties,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/lead-analytics', new Blob([payload], { type: 'application/json' }));
    return;
  }

  void fetch('/api/lead-analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload,
    keepalive: true,
  });
}

function readStoredAttribution(): QuoteAttribution {
  const raw = sessionStorage.getItem(QUOTE_ATTRIBUTION_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
    ) as QuoteAttribution;
  } catch {
    return {};
  }
}

function buildCampaignKey(attribution: QuoteAttribution): string {
  if (attribution.utm_campaign || attribution.utm_source || attribution.utm_medium) {
    return [
      attribution.utm_source || 'unknown-source',
      attribution.utm_medium || 'unknown-medium',
      attribution.utm_campaign || 'unknown-campaign',
    ].join(' / ');
  }

  if (attribution.fbclid) return 'click-id / facebook';
  if (attribution.gclid) return 'click-id / google';
  if (attribution.msclkid) return 'click-id / microsoft';
  if (attribution.ttclid) return 'click-id / tiktok';
  if (attribution.referrer_host) return `referrer / ${attribution.referrer_host}`;
  return 'direct';
}

function resolveAttributionSource(attribution: QuoteAttribution): string {
  if (attribution.utm_campaign || attribution.utm_source || attribution.utm_medium) {
    return 'utm';
  }

  if (attribution.fbclid || attribution.gclid || attribution.msclkid || attribution.ttclid) {
    return 'click_id';
  }

  if (attribution.referrer_host) {
    return 'referrer';
  }

  return 'direct';
}

function getHost(value: string): string {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return '';
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}