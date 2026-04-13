/**
 * GET /api/analytics-verify?token=…
 *
 * Verifies a magic‑link token, sets an httpOnly session cookie, and redirects
 * the user to /analytics.
 */
import type { APIRoute } from 'astro';
import {
  createSessionCookie,
  isAllowedEmail,
  verifyMagicToken,
} from '../../lib/analytics-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  const result = await verifyMagicToken(token);

  if (!result || !isAllowedEmail(result.email)) {
    return new Response(
      '<html><body><h2>Invalid or expired link</h2><p>Please request a new login link from the analytics page.</p></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const cookie = await createSessionCookie(result.email);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/analytics',
      'Set-Cookie': cookie,
    },
  });
};
