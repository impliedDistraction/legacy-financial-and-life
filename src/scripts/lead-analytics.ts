type QuoteAnalyticsOptions = {
  eventName: string;
  route: string;
  stage: 'landing' | 'form' | 'submission' | 'handoff' | 'error';
  status: 'info' | 'success' | 'warning' | 'error';
  ownerScope: 'legacy' | 'handoff' | 'client' | 'external';
  interest?: string;
  properties?: Record<string, string>;
};

type VercelAnalyticsWindow = Window & {
  va?: {
    track: (eventName: string, properties?: Record<string, string>) => void;
  };
};

const TRACKING_ID_KEY = 'quote_tracking_id';
const TRACKING_ID_CONSUMED_KEY = 'quote_tracking_id_consumed';
const QUOTE_INTEREST_KEY = 'quote_interest';

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

export function trackQuoteAnalyticsEvent(options: QuoteAnalyticsOptions): void {
  const trackingId = getQuoteTrackingId();
  const properties = {
    tracking_id: trackingId,
    route: options.route,
    stage: options.stage,
    status: options.status,
    owner_scope: options.ownerScope,
    ...(options.interest ? { interest: options.interest } : {}),
    ...(options.properties ?? {}),
  };

  const analyticsWindow = window as VercelAnalyticsWindow;
  analyticsWindow.va?.track(options.eventName, properties);

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