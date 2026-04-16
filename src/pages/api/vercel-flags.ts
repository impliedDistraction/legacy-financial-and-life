/**
 * Flags Discovery Endpoint  /.well-known/vercel/flags
 *
 * Vercel Toolbar requests this to learn about the project's feature flags.
 * The request is verified using FLAGS_SECRET so definitions aren't public.
 *
 * Because Astro can't create routes starting with a dot, we serve this at
 * /api/vercel-flags and rewrite from /.well-known/vercel/flags in vercel.json.
 */
import type { APIRoute } from 'astro';
import { verifyAccess } from 'flags';
import { FLAG_DEFINITIONS } from '../../lib/flags';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const flagsSecret = import.meta.env.FLAGS_SECRET ?? process.env.FLAGS_SECRET;

  // If FLAGS_SECRET isn't configured, return 404 to avoid leaking that the
  // endpoint exists but simply isn't set up yet.
  if (!flagsSecret) {
    return new Response(null, { status: 404 });
  }

  const access = await verifyAccess(
    request.headers.get('Authorization'),
    flagsSecret,
  );

  if (!access) {
    return new Response(null, { status: 401 });
  }

  return new Response(
    JSON.stringify({
      definitions: FLAG_DEFINITIONS,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
