const ATTRIBUTION_FIELD_KEYS = [
  'landing_path',
  'landing_url',
  'referrer',
  'referrer_host',
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

type AttributionFieldKey = (typeof ATTRIBUTION_FIELD_KEYS)[number];

export type LeadAttribution = Partial<Record<AttributionFieldKey, string>> & {
  attribution_source?: string;
  campaign_key?: string;
};

export function readLeadAttribution(data: FormData, referrerHeader?: string | null): LeadAttribution {
  const base: LeadAttribution = {};

  for (const key of ATTRIBUTION_FIELD_KEYS) {
    const value = normalizeAttributionValue(data.get(key));
    if (value) {
      base[key] = value;
    }
  }

  if (!base.referrer && referrerHeader?.trim()) {
    base.referrer = truncate(referrerHeader.trim(), 500);
  }

  if (!base.referrer_host && base.referrer) {
    base.referrer_host = getHost(base.referrer);
  }

  const attributionSource = resolveAttributionSource(base);
  if (attributionSource) {
    base.attribution_source = attributionSource;
  }

  const campaignKey = buildCampaignKey(base);
  if (campaignKey) {
    base.campaign_key = campaignKey;
  }

  return base;
}

export function flattenLeadAttribution(attribution: LeadAttribution): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attribution)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => [key, value.trim()]),
  );
}

export function buildCampaignKey(attribution: Partial<LeadAttribution>): string {
  const utmCampaign = attribution.utm_campaign?.trim();
  const utmSource = attribution.utm_source?.trim();
  const utmMedium = attribution.utm_medium?.trim();

  if (utmCampaign || utmSource || utmMedium) {
    return [utmSource || 'unknown-source', utmMedium || 'unknown-medium', utmCampaign || 'unknown-campaign']
      .join(' / ')
      .slice(0, 180);
  }

  if (attribution.fbclid) return 'click-id / facebook';
  if (attribution.gclid) return 'click-id / google';
  if (attribution.msclkid) return 'click-id / microsoft';
  if (attribution.ttclid) return 'click-id / tiktok';
  if (attribution.referrer_host) return `referrer / ${attribution.referrer_host}`.slice(0, 180);

  return 'direct';
}

function resolveAttributionSource(attribution: Partial<LeadAttribution>): string {
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

function normalizeAttributionValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return truncate(trimmed, 500);
}

function getHost(value: string): string | undefined {
  try {
    return new URL(value).host.toLowerCase().slice(0, 200) || undefined;
  } catch {
    return undefined;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}