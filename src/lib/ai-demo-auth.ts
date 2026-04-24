/**
 * Magic‑link authentication for the AI demo page.
 *
 * Mirrors the analytics auth flow but scoped to /ai-demo and /api/ai-*.
 * Reuses ANALYTICS_SECRET for HMAC signing (same project, same team).
 *
 * Flow:
 *   1. User visits /ai-demo → redirected to /ai-demo-login
 *   2. Enters email → POST /api/ai-demo-auth sends a Resend email with a
 *      signed token link.
 *   3. User clicks the link → GET /api/ai-demo-verify validates the token,
 *      sets an httpOnly session cookie, and redirects to /ai-demo.
 *   4. Subsequent /ai-demo and /api/ai-* requests check the cookie.
 *
 * Env vars:
 *   AI_DEMO_ALLOWED_EMAILS – comma‑separated list of emails that may log in.
 *   ANALYTICS_SECRET       – 32+ char secret for HMAC signing tokens & cookies.
 */

const TOKEN_TTL_MS = 15 * 60 * 1000; // magic link valid 15 min
const COOKIE_TTL_S = 8 * 60 * 60;    // session valid 8 hours
export const COOKIE_NAME = '__ai_demo_session';

// ── allowed emails ──────────────────────────────────────────────────

export function getAllowedEmails(): string[] {
  const raw = getEnv('AI_DEMO_ALLOWED_EMAILS');
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  const allowed = getAllowedEmails();
  return allowed.length > 0 && allowed.includes(email.trim().toLowerCase());
}

// ── token generation & verification ─────────────────────────────────

export async function createMagicToken(email: string): Promise<string> {
  const secret = requireSecret();
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + TOKEN_TTL_MS,
    scope: 'ai-demo',
  });
  const sig = await hmac(secret, payload);
  return toBase64Url(`${payload}|${sig}`);
}

export async function verifyMagicToken(token: string): Promise<{ email: string } | null> {
  const secret = requireSecret();

  let decoded: string;
  try {
    decoded = fromBase64Url(token);
  } catch {
    return null;
  }

  const sepIdx = decoded.lastIndexOf('|');
  if (sepIdx === -1) return null;

  const payloadStr = decoded.slice(0, sepIdx);
  const sig = decoded.slice(sepIdx + 1);

  const expected = await hmac(secret, payloadStr);
  if (!safeEqual(sig, expected)) return null;

  let payload: { email: string; exp: number; scope?: string };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  if (!payload.email || typeof payload.email !== 'string') return null;

  return { email: payload.email };
}

// ── session cookie ──────────────────────────────────────────────────

export async function createSessionCookie(email: string): Promise<string> {
  const secret = requireSecret();
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + COOKIE_TTL_S * 1000,
    scope: 'ai-demo',
  });
  const sig = await hmac(secret, payload);
  const value = toBase64Url(`${payload}|${sig}`);

  // Path=/ so the cookie is sent for both /ai-demo and /api/ai-*
  return [
    `${COOKIE_NAME}=${value}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=${COOKIE_TTL_S}`,
  ].join('; ');
}

export async function verifySessionCookie(cookieHeader: string | null): Promise<{ email: string } | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  const value = match.slice(COOKIE_NAME.length + 1);
  const secret = requireSecret();

  let decoded: string;
  try {
    decoded = fromBase64Url(value);
  } catch {
    return null;
  }

  const sepIdx = decoded.lastIndexOf('|');
  if (sepIdx === -1) return null;

  const payloadStr = decoded.slice(0, sepIdx);
  const sig = decoded.slice(sepIdx + 1);

  const expected = await hmac(secret, payloadStr);
  if (!safeEqual(sig, expected)) return null;

  let payload: { email: string; exp: number };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  if (!payload.email) return null;

  return { email: payload.email };
}

// ── internal ────────────────────────────────────────────────────────

function getEnv(key: string): string {
  try {
    return ((import.meta as any).env?.[key] ?? '').trim();
  } catch {
    return '';
  }
}

function requireSecret(): string {
  const s = getEnv('ANALYTICS_SECRET');
  if (!s || s.length < 32) {
    throw new Error('ANALYTICS_SECRET must be at least 32 characters');
  }
  return s;
}

async function hmac(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}
