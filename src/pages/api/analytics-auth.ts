/**
 * POST /api/analytics-auth
 *
 * Accepts { email } and, if the email is in ANALYTICS_ALLOWED_EMAILS, sends a
 * magic‑link via Resend.  Always returns 200 to avoid email‑enumeration.
 */
import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { createMagicToken, isAllowedEmail } from '../../lib/analytics-auth';

export const prerender = false;

// Rate limiting: 5 magic-link requests per 15 minutes per IP
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    // Return 200 to avoid revealing rate-limit state to attackers
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = (body.email ?? '').trim().toLowerCase();

  // Always return 200 to prevent email enumeration
  const okResponse = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return okResponse();
  }

  if (!isAllowedEmail(email)) {
    console.warn('Analytics login attempt from disallowed email', { email });
    return okResponse();
  }

  const resendKey = import.meta.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY not configured — cannot send magic link');
    return okResponse();
  }

  const token = await createMagicToken(email);
  const siteUrl = import.meta.env.SITE || 'https://legacyfinancial.app';
  const verifyUrl = `${siteUrl}/api/analytics-verify?token=${encodeURIComponent(token)}`;

  const resend = new Resend(resendKey);

  try {
    await resend.emails.send({
      from: 'Legacy Analytics <hello@legacyfinancial.app>',
      to: [email],
      subject: 'Your analytics dashboard login link',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b;">
          <h2 style="color:#1e3a5f;">Analytics Dashboard Login</h2>
          <p>Click the button below to access your team analytics dashboard. This link expires in 15 minutes.</p>
          <div style="margin:24px 0;">
            <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#1a62db;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Open Dashboard
            </a>
          </div>
          <p style="font-size:13px;color:#64748b;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Failed to send analytics magic link', err);
  }

  return okResponse();
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
