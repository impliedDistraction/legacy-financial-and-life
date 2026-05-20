import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const HMAC_SECRET = import.meta.env.UNSUBSCRIBE_HMAC_SECRET?.trim()
  || import.meta.env.OPENCLAW_SECRET?.trim() || '';

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyToken(prospectId: string, token: string): Promise<boolean> {
  if (!HMAC_SECRET || !token || !prospectId) return false;
  const expected = await hmacHex(HMAC_SECRET, prospectId);
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * GET /api/info-request?pid={prospectId}&token={hmac}
 * 
 * Low-friction alternative to scheduling a call. Records that the prospect
 * wants more info and returns a confirmation page. Triggers an info-pack
 * email from Sentinel.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const pid = url.searchParams.get('pid');
  const token = url.searchParams.get('token');

  if (!pid || !token) {
    return htmlResponse('Missing parameters', 'This link appears to be invalid.', 400);
  }

  const valid = await verifyToken(pid, token);
  if (!valid) {
    return htmlResponse('Invalid link', 'This link has expired or is invalid.', 403);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return htmlResponse('Service unavailable', 'Please try again later.', 503);
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Fetch prospect
  const prospectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${pid}&select=id,name,email,state,interaction_stage,properties`,
    { headers },
  );

  if (!prospectRes.ok) {
    return htmlResponse('Error', 'Could not process your request.', 500);
  }

  const prospects = await prospectRes.json();
  if (prospects.length === 0) {
    return htmlResponse('Not found', 'We couldn\'t find your record.', 404);
  }

  const prospect = prospects[0];
  const props = prospect.properties || {};

  // Don't re-process if already requested
  if (props.info_pack_requested_at) {
    return htmlResponse(
      'Info on its way!',
      `<p>Hi ${escapeHtml((prospect.name || '').split(' ')[0] || 'there')} — we've already got your request. Check your inbox at <strong>${escapeHtml(prospect.email || '')}</strong> for the details.</p>
       <p style="margin-top: 16px; color: #64748b;">If you don't see it, check your spam folder or reply to any of our previous emails.</p>`,
      200,
    );
  }

  // Update prospect: mark info requested
  await fetch(`${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${pid}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      interaction_stage: 'info_requested',
      updated_at: new Date().toISOString(),
      properties: {
        ...props,
        info_pack_requested_at: new Date().toISOString(),
        info_pack_request_ip: request.headers.get('cf-connecting-ip')
          || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || 'unknown',
      },
    }),
  });

  const firstName = (prospect.name || '').split(' ')[0] || 'there';

  return htmlResponse(
    'Got it — info heading your way!',
    `<p>Hi ${escapeHtml(firstName)} — we'll send you the details about Legacy Financial & Life within the next few minutes.</p>
     <p style="margin-top: 12px;">Here's what to expect:</p>
     <ul style="margin: 12px 0; padding-left: 20px; color: #334155;">
       <li>How our AI tools handle lead gen and outreach for you</li>
       <li>Comp structure and carrier access through Alliance FMO</li>
       <li>What day-to-day looks like for agents on our team</li>
       <li>No-pressure next steps if you want to explore further</li>
     </ul>
     <p style="margin-top: 16px; color: #64748b;">Check your inbox at <strong>${escapeHtml(prospect.email || '')}</strong>. If you have questions in the meantime, just reply to any of our emails.</p>`,
    200,
  );
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlResponse(title: string, body: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Legacy Financial & Life</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; }
    .card { max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #1e293b; font-size: 22px; margin: 0 0 16px; }
    p { color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 12px; }
    .brand { text-align: center; margin-bottom: 24px; }
    .brand span { background: linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 18px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand"><span>Legacy Financial & Life</span></div>
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
