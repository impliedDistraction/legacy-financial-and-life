/**
 * Lead quality scoring module.
 *
 * Computes a 0–100 quality score for each quote submission based on
 * signals available at request time.  The score and per-signal breakdown
 * are stored in `lead_flow_events.properties` so the analytics dashboard
 * can surface lead quality at a glance.
 *
 * External enrichment (IP geolocation via ipinfo.io) is optional — set
 * `IPINFO_TOKEN` in env to enable.  When absent the module still scores
 * using all other signals.
 */

// ── Licensed states (must stay in sync with fb-lead.ts) ─────────────

const LICENSED_STATES = new Set([
  'ohio', 'georgia', 'oklahoma', 'south carolina', 'mississippi',
  'michigan', 'texas', 'utah', 'alabama', 'louisiana',
]);

// ── Disposable / throwaway email domains ────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net',
  'tempmail.com', 'throwaway.email', 'yopmail.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'discard.email', 'maildrop.cc',
  'temp-mail.org', 'fakeinbox.com', 'trashmail.com', 'trashmail.me',
  'getnada.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com',
  'tempail.com', 'tempmailaddress.com', '10minutemail.com',
  'mailnesia.com', 'harakirimail.com', 'binkmail.com',
]);

const TRUSTED_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
  'icloud.com', 'me.com', 'live.com', 'msn.com', 'comcast.net',
  'att.net', 'sbcglobal.net', 'verizon.net', 'cox.net',
  'charter.net', 'earthlink.net', 'mac.com', 'protonmail.com',
  'proton.me', 'zoho.com',
]);

// ── Bot / headless user-agent patterns ──────────────────────────────

const BOT_UA_PATTERNS = [
  /headless/i, /phantomjs/i, /selenium/i, /puppeteer/i,
  /crawl/i, /spider/i, /bot\b/i, /scrape/i, /curl/i,
  /wget/i, /python-requests/i, /httpx/i, /aiohttp/i,
];

// ── Types ───────────────────────────────────────────────────────────

export type LeadScoreInput = {
  email: string;
  phone: string;
  state: string;
  clientIp: string;
  userAgent: string;
  referrer: string;
  formFillMs: number | null;
};

export type SignalResult = {
  signal: string;
  points: number;
  maxPoints: number;
  detail: string;
};

export type LeadScoreResult = {
  score: number;
  tier: 'hot' | 'warm' | 'cold';
  signals: SignalResult[];
  ipGeo?: IpGeoResult | null;
};

type IpGeoResult = {
  country: string;
  region: string;
  city: string;
  org: string;
  isVpn: boolean;
  isHosting: boolean;
};

// ── Signal scorers ──────────────────────────────────────────────────

function scoreFormFillTime(fillMs: number | null): SignalResult {
  const max = 15;
  if (fillMs === null) {
    return { signal: 'form_fill_time', points: 8, maxPoints: max, detail: 'No timing data (neutral)' };
  }
  const seconds = fillMs / 1000;
  if (seconds < 5) {
    return { signal: 'form_fill_time', points: 0, maxPoints: max, detail: `${seconds.toFixed(1)}s — suspiciously fast` };
  }
  if (seconds < 15) {
    return { signal: 'form_fill_time', points: 8, maxPoints: max, detail: `${seconds.toFixed(1)}s — quick but plausible` };
  }
  if (seconds < 120) {
    return { signal: 'form_fill_time', points: 15, maxPoints: max, detail: `${seconds.toFixed(1)}s — normal fill time` };
  }
  // Very long fill times can indicate a real but distracted user — still good
  return { signal: 'form_fill_time', points: 12, maxPoints: max, detail: `${seconds.toFixed(1)}s — slow but engaged` };
}

function scoreEmailDomain(email: string): SignalResult {
  const max = 20;
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) {
    return { signal: 'email_domain', points: 0, maxPoints: max, detail: 'Invalid email format' };
  }
  const domain = email.slice(atIndex + 1).toLowerCase();

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { signal: 'email_domain', points: 0, maxPoints: max, detail: `${domain} — disposable/throwaway` };
  }
  if (TRUSTED_DOMAINS.has(domain)) {
    return { signal: 'email_domain', points: 20, maxPoints: max, detail: `${domain} — trusted provider` };
  }
  // Unknown domain — could be personal or corporate, slight deduction
  return { signal: 'email_domain', points: 12, maxPoints: max, detail: `${domain} — unrecognized domain` };
}

function scorePhone(phone: string): SignalResult {
  const max = 15;
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return { signal: 'phone_format', points: 0, maxPoints: max, detail: 'No phone provided' };
  }
  // Strip leading 1 for US
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (normalized.length !== 10) {
    return { signal: 'phone_format', points: 3, maxPoints: max, detail: `${normalized.length} digits — non-standard` };
  }
  // Check for obviously fake patterns
  if (/^(\d)\1{9}$/.test(normalized)) {
    return { signal: 'phone_format', points: 0, maxPoints: max, detail: 'Repeated digit pattern — likely fake' };
  }
  if (normalized.startsWith('555')) {
    return { signal: 'phone_format', points: 0, maxPoints: max, detail: '555 prefix — fictitious number' };
  }
  return { signal: 'phone_format', points: 15, maxPoints: max, detail: 'Valid 10-digit US number' };
}

function scoreState(state: string): SignalResult {
  const max = 15;
  const normalized = state.trim().toLowerCase();
  if (!normalized) {
    return { signal: 'state_match', points: 0, maxPoints: max, detail: 'No state provided' };
  }
  if (LICENSED_STATES.has(normalized)) {
    return { signal: 'state_match', points: 15, maxPoints: max, detail: `${state} — licensed state` };
  }
  return { signal: 'state_match', points: 5, maxPoints: max, detail: `${state} — not a licensed state` };
}

function scoreReferrer(referrer: string): SignalResult {
  const max = 10;
  if (!referrer) {
    return { signal: 'referrer', points: 5, maxPoints: max, detail: 'No referrer (direct or privacy-stripped)' };
  }
  const lower = referrer.toLowerCase();
  if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('instagram.com')) {
    return { signal: 'referrer', points: 10, maxPoints: max, detail: 'Facebook/Instagram referrer' };
  }
  if (lower.includes('google.com') || lower.includes('bing.com')) {
    return { signal: 'referrer', points: 10, maxPoints: max, detail: 'Search engine referrer' };
  }
  return { signal: 'referrer', points: 7, maxPoints: max, detail: `Other referrer: ${referrer.slice(0, 60)}` };
}

function scoreUserAgent(ua: string): SignalResult {
  const max = 10;
  if (!ua) {
    return { signal: 'user_agent', points: 0, maxPoints: max, detail: 'No User-Agent header' };
  }
  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      return { signal: 'user_agent', points: 0, maxPoints: max, detail: 'Bot/headless user agent detected' };
    }
  }
  // Check for very short UAs (often bots)
  if (ua.length < 30) {
    return { signal: 'user_agent', points: 3, maxPoints: max, detail: 'Unusually short User-Agent' };
  }
  return { signal: 'user_agent', points: 10, maxPoints: max, detail: 'Normal browser User-Agent' };
}

function scoreIpGeo(geo: IpGeoResult | null, statedState: string): SignalResult {
  const max = 15;
  if (!geo) {
    return { signal: 'ip_geo', points: 8, maxPoints: max, detail: 'IP geolocation not available' };
  }

  // Hosting / datacenter IP = strong spam signal
  if (geo.isHosting) {
    return { signal: 'ip_geo', points: 0, maxPoints: max, detail: `Datacenter/hosting IP (${geo.org})` };
  }

  // Non-US country
  if (geo.country !== 'US') {
    return { signal: 'ip_geo', points: 2, maxPoints: max, detail: `Non-US IP (${geo.country}, ${geo.city})` };
  }

  // US IP with VPN
  if (geo.isVpn) {
    return { signal: 'ip_geo', points: 5, maxPoints: max, detail: `US VPN/proxy IP (${geo.org})` };
  }

  // US IP — check region match against stated state
  const stateNorm = statedState.trim().toLowerCase();
  const regionNorm = geo.region.trim().toLowerCase();
  if (stateNorm && regionNorm && regionNorm.includes(stateNorm)) {
    return { signal: 'ip_geo', points: 15, maxPoints: max, detail: `US IP in ${geo.region} — matches stated state` };
  }

  // US but different state — not necessarily bad (mobile, travel)
  return { signal: 'ip_geo', points: 10, maxPoints: max, detail: `US IP in ${geo.region} (stated: ${statedState})` };
}

// ── IP geolocation (ipinfo.io — optional) ───────────────────────────

async function lookupIpGeo(ip: string): Promise<IpGeoResult | null> {
  const token = getIpInfoToken();
  if (!token || ip === 'unknown') return null;

  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const privacy = (data.privacy ?? {}) as Record<string, boolean>;

    return {
      country: String(data.country ?? ''),
      region: String(data.region ?? ''),
      city: String(data.city ?? ''),
      org: String(data.org ?? ''),
      isVpn: Boolean(privacy.vpn),
      isHosting: Boolean(privacy.hosting),
    };
  } catch (err) {
    console.warn('IP geolocation lookup failed (scoring without it):', err);
    return null;
  }
}

// ── Main scoring function ───────────────────────────────────────────

export async function scoreLeadQuality(input: LeadScoreInput): Promise<LeadScoreResult> {
  // IP geolocation runs concurrently with the other (synchronous) signal checks
  const geoPromise = lookupIpGeo(input.clientIp);

  const signals: SignalResult[] = [
    scoreFormFillTime(input.formFillMs),
    scoreEmailDomain(input.email),
    scorePhone(input.phone),
    scoreState(input.state),
    scoreReferrer(input.referrer),
    scoreUserAgent(input.userAgent),
  ];

  const ipGeo = await geoPromise;
  signals.push(scoreIpGeo(ipGeo, input.state));

  const score = signals.reduce((sum, s) => sum + s.points, 0);
  const tier: LeadScoreResult['tier'] =
    score >= 80 ? 'hot' :
    score >= 50 ? 'warm' :
    'cold';

  return { score, tier, signals, ipGeo };
}

// ── Env helper ──────────────────────────────────────────────────────

function getIpInfoToken(): string | undefined {
  try {
    return (import.meta as any).env?.IPINFO_TOKEN?.trim() || undefined;
  } catch {
    return undefined;
  }
}
