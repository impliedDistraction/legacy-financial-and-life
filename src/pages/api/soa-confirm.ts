import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const SOA_HMAC_SECRET = import.meta.env.SOA_HMAC_SECRET?.trim()
  || import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  || '';
const RESEND_API_KEY = import.meta.env.RESEND_API_KEY?.trim() || '';
const AGENT_NOTIFICATION_EMAIL = import.meta.env.SOA_AGENT_EMAIL?.trim()
  || import.meta.env.DASHBOARD_EMAILS?.split(',')[0]?.trim()
  || '';

// ─── HMAC Verification (mirrors sentinel/workers/soa-manager.js) ────

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface TokenPayload {
  soaRecordId: string;
  email: string;
  timestamp: number;
}

async function verifySOAToken(token: string): Promise<TokenPayload | null> {
  try {
    // base64url decode
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 5) return null;

    const hmac = parts.pop()!;
    const payload = parts.join(':');
    const [prefix, soaRecordId, email, timestampStr] = parts;

    if (prefix !== 'soa') return null;

    const expected = await hmacHex(SOA_HMAC_SECRET, payload);

    // Constant-time comparison
    if (expected.length !== hmac.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ hmac.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    // 7-day expiry
    const timestamp = parseInt(timestampStr, 10);
    if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return null;

    return { soaRecordId, email, timestamp };
  } catch {
    return null;
  }
}

function supa(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

// ─── Rate Limiting ───────────────────────────────────────────────────

const confirmAttempts = new Map<string, { count: number; first: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = confirmAttempts.get(ip);
  if (!entry || now - entry.first > RATE_WINDOW) {
    confirmAttempts.set(ip, { count: 1, first: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ─── Response Rendering ──────────────────────────────────────────────

function renderPage(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Legacy Financial</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 560px; width: 100%; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e40af, #2563eb); padding: 24px 32px; text-align: center; }
    .header h1 { color: white; font-size: 18px; font-weight: 700; }
    .content { padding: 32px; }
    .content h2 { color: #1e293b; font-size: 22px; margin-bottom: 12px; }
    .content p { color: #475569; line-height: 1.6; margin-bottom: 16px; }
    .details { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .details dt { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .details dd { color: #1e293b; font-size: 14px; font-weight: 500; margin-bottom: 12px; }
    .check { color: #16a34a; font-size: 48px; text-align: center; margin-bottom: 16px; }
    .timestamp { color: #94a3b8; font-size: 12px; text-align: center; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h1>Legacy Financial &amp; Life</h1></div>
    <div class="content">${body}</div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─── Handler ─────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ request, url }) => {
  const token = url.searchParams.get('token');
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (!token) {
    return renderPage('Invalid Link', `
      <h2>Invalid Link</h2>
      <p>This confirmation link is missing required information. Please check your email and try again.</p>
    `, 400);
  }

  // Rate limit
  if (!checkRateLimit(clientIP)) {
    return renderPage('Too Many Attempts', `
      <h2>Too Many Attempts</h2>
      <p>Please wait a while before trying again.</p>
    `, 429);
  }

  // Verify token
  const payload = await verifySOAToken(token);
  if (!payload) {
    return renderPage('Link Expired', `
      <h2>Link Expired or Invalid</h2>
      <p>This confirmation link has expired or is invalid. SOA forms are valid for 7 days from when they were sent.</p>
      <p>Please contact your agent for a new form.</p>
    `, 400);
  }

  // Fetch the SOA record
  const soaRes = await supa(`soa_records?id=eq.${payload.soaRecordId}&select=*&limit=1`);
  if (!soaRes.ok) {
    return renderPage('Error', `<h2>Error</h2><p>Unable to process your confirmation. Please try again later.</p>`, 500);
  }

  const soaRecords = await soaRes.json();
  const soa = soaRecords[0];

  if (!soa) {
    return renderPage('Not Found', `<h2>Record Not Found</h2><p>This SOA record could not be found.</p>`, 404);
  }

  // Already confirmed?
  if (soa.status === 'confirmed') {
    const confirmedAt = new Date(soa.confirmed_at).toLocaleString('en-US', { timeZone: 'America/New_York' });
    return renderPage('Already Confirmed', `
      <div class="check">✓</div>
      <h2>Already Confirmed</h2>
      <p>You confirmed this Scope of Appointment on <strong>${confirmedAt}</strong>.</p>
      <p>No further action is needed. Your agent has a record of your confirmation.</p>
      <div class="timestamp">Confirmation ID: ${soa.id.slice(0, 8)}</div>
    `);
  }

  // Confirm the SOA
  const now = new Date().toISOString();
  const patchRes = await supa(`soa_records?id=eq.${soa.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'confirmed',
      confirmed_at: now,
      confirmation_ip: clientIP,
      updated_at: now,
    }),
  });

  if (!patchRes.ok) {
    return renderPage('Error', `<h2>Error</h2><p>Unable to record your confirmation. Please try again.</p>`, 500);
  }

  // Also update the linked event
  if (soa.event_id) {
    await supa(`calendly_events?id=eq.${soa.event_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ soa_confirmed: true, updated_at: now }),
    });
  }

  // Notify the agent that the SOA was confirmed
  if (RESEND_API_KEY && AGENT_NOTIFICATION_EMAIL) {
    const meetingStr = new Date(soa.meeting_date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York',
    });
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Legacy Financial <appointments@legacyfinancial.app>',
        to: AGENT_NOTIFICATION_EMAIL,
        subject: `✓ SOA Confirmed — ${soa.prospect_name} (${meetingStr})`,
        html: `<p><strong>${soa.prospect_name}</strong> confirmed their Scope of Appointment for your meeting on <strong>${meetingStr}</strong>.</p>
<p style="color:#64748b;font-size:13px;">Topics: ${(soa.topics_discussed || []).join(', ')}</p>
<p style="color:#64748b;font-size:13px;">Confirmed at: ${new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>`,
        headers: { 'X-Legacy-Template': 'soa-agent-notification' },
      }),
    }).catch(() => {}); // fire-and-forget
  }

  // Format meeting date for display
  const meetingDate = new Date(soa.meeting_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  const meetingTime = new Date(soa.meeting_date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  const topics = (soa.topics_discussed || []).map((t: string) => `<li>${t}</li>`).join('');
  const confirmedAt = new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' });

  return renderPage('Confirmed', `
    <div class="check">✓</div>
    <h2>Scope of Appointment Confirmed</h2>
    <p>Thank you, <strong>${soa.prospect_name}</strong>. Your Scope of Appointment has been confirmed and recorded.</p>
    
    <dl class="details">
      <dt>Meeting Date</dt>
      <dd>${meetingDate} at ${meetingTime}</dd>
      <dt>Agent</dt>
      <dd>${soa.agent_name}</dd>
      <dt>Topics Approved</dt>
      <dd><ul style="padding-left:16px;margin:4px 0;">${topics}</ul></dd>
    </dl>
    
    <p>Your agent (${soa.agent_name}) has been notified and will only discuss the topics listed above during your appointment.</p>
    
    <div class="timestamp">
      Confirmed: ${confirmedAt} ET<br>
      Confirmation ID: ${soa.id.slice(0, 8)}
    </div>
  `);
};
