import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const HMAC_SECRET = import.meta.env.UNSUBSCRIBE_HMAC_SECRET?.trim()
  || import.meta.env.OPENCLAW_SECRET?.trim()
  || '';

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyToken(callId: string, token: string): Promise<boolean> {
  if (!HMAC_SECRET || !token || !callId) return false;
  const expected = await hmacHex(HMAC_SECRET, `call-feedback:${callId}`);
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

function escHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rate limiting
const ipCounts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 20;
}

/**
 * GET /api/call-feedback?cid={callId}&token={hmac}
 *
 * Shows the call feedback form with transcript summary.
 * The call data is passed via query params (encoded by bridge when sending SMS).
 */
export const GET: APIRoute = async ({ url }) => {
  const cid = url.searchParams.get('cid');
  const token = url.searchParams.get('token');

  if (!cid || !token) {
    return renderPage('Invalid Link', `
      <div class="content">
        <h2>Invalid Feedback Link</h2>
        <p>This link appears to be incomplete or expired.</p>
      </div>`, 400);
  }

  if (!(await verifyToken(cid, token))) {
    return renderPage('Invalid Link', `
      <div class="content">
        <h2>Invalid Link</h2>
        <p>This feedback link could not be verified.</p>
      </div>`, 403);
  }

  // Decode call metadata from URL params
  const caller = url.searchParams.get('caller') || 'Unknown';
  const duration = url.searchParams.get('dur') || '?';
  const turns = url.searchParams.get('turns') || '?';
  const mode = url.searchParams.get('mode') || 'sales';
  const outcome = url.searchParams.get('outcome') || 'completed';
  const ts = url.searchParams.get('ts') || '';

  // Check if already submitted
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/call_feedback?call_id=eq.${encodeURIComponent(cid)}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (existing.length > 0) {
        return renderPage('Already Submitted', `
          <div class="success">
            <div class="icon">✅</div>
            <h2>Feedback Already Recorded</h2>
            <p>You've already submitted feedback for this call. Thank you!</p>
          </div>`);
      }
    }
  }

  const formattedTime = ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' }) : 'Unknown time';

  const issueOptions = [
    { value: 'stt_accuracy', label: 'Couldn\'t understand caller' },
    { value: 'wrong_response', label: 'Gave wrong/irrelevant response' },
    { value: 'too_repetitive', label: 'Repeated itself / looped' },
    { value: 'pronunciation', label: 'Pronunciation issues' },
    { value: 'too_slow', label: 'Too slow / long pauses' },
    { value: 'too_robotic', label: 'Sounded robotic / unnatural' },
    { value: 'missed_intent', label: 'Missed what caller meant' },
    { value: 'premature_hangup', label: 'Ended call too early' },
    { value: 'voicemail_fail', label: 'Talked to voicemail / IVR' },
    { value: 'other', label: 'Other (describe in notes)' },
  ];

  const issueCheckboxes = issueOptions.map(opt =>
    `<label class="checkbox-label">
      <input type="checkbox" name="issues" value="${opt.value}">
      <span>${escHtml(opt.label)}</span>
    </label>`
  ).join('\n');

  return renderPage('Call Feedback', `
    <div class="content">
      <h2>Rate This Call</h2>
      <div class="call-meta">
        <div class="meta-row"><span class="meta-label">Caller:</span> <span>${escHtml(caller)}</span></div>
        <div class="meta-row"><span class="meta-label">Time:</span> <span>${escHtml(formattedTime)}</span></div>
        <div class="meta-row"><span class="meta-label">Duration:</span> <span>${escHtml(duration)}s &middot; ${escHtml(turns)} turns</span></div>
        <div class="meta-row"><span class="meta-label">Mode:</span> <span>${escHtml(mode)}</span></div>
        <div class="meta-row"><span class="meta-label">Outcome:</span> <span class="badge badge-${outcome === 'qualified' ? 'green' : 'gray'}">${escHtml(outcome)}</span></div>
      </div>

      <form method="POST" action="/api/call-feedback">
        <input type="hidden" name="cid" value="${escHtml(cid)}">
        <input type="hidden" name="token" value="${escHtml(token)}">

        <div class="form-group">
          <label class="form-label">Overall Quality</label>
          <p class="form-hint">How well did the AI handle this call?</p>
          <div class="star-rating">
            ${[1,2,3,4,5].map(n => `<label class="star"><input type="radio" name="rating" value="${n}" required><span>★</span></label>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Transcription Accuracy</label>
          <p class="form-hint">How well did it understand what the caller said?</p>
          <div class="star-rating">
            ${[1,2,3,4,5].map(n => `<label class="star"><input type="radio" name="accuracy_rating" value="${n}"><span>★</span></label>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Issues Observed</label>
          <p class="form-hint">Select any that apply:</p>
          <div class="checkbox-group">
            ${issueCheckboxes}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" rows="3" placeholder="Anything specific you noticed? What should we fix?" maxlength="2000"></textarea>
        </div>

        <button type="submit" class="submit-btn">Submit Feedback</button>
      </form>
    </div>`);
};

/**
 * POST /api/call-feedback
 *
 * Receives submitted feedback form and stores in Supabase.
 */
export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return renderPage('Too Many Requests', `<div class="content"><p>Please slow down and try again.</p></div>`, 429);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return renderPage('Error', `<div class="content"><p>Service temporarily unavailable.</p></div>`, 503);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return renderPage('Error', `<div class="content"><p>Invalid form submission.</p></div>`, 400);
  }

  const cid = String(formData.get('cid') || '').trim();
  const token = String(formData.get('token') || '').trim();

  if (!cid || !token || !(await verifyToken(cid, token))) {
    return renderPage('Invalid', `<div class="content"><p>This feedback link is invalid or expired.</p></div>`, 403);
  }

  const rating = Math.min(5, Math.max(1, parseInt(String(formData.get('rating') || '3'), 10)));
  const accuracyRating = parseInt(String(formData.get('accuracy_rating') || '0'), 10) || null;
  const issues = formData.getAll('issues').map(v => String(v).slice(0, 50));
  const notes = String(formData.get('notes') || '').trim().slice(0, 2000);

  // Store feedback
  const res = await fetch(`${SUPABASE_URL}/rest/v1/call_feedback`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      call_id: cid,
      rating,
      accuracy_rating: accuracyRating,
      issues: issues.length > 0 ? issues : null,
      notes: notes || null,
      reviewer_phone: clientIp, // We use IP as a lightweight reviewer identifier
    }),
  });

  if (!res.ok) {
    console.error('[call-feedback] DB insert failed:', res.status, await res.text().catch(() => ''));
    return renderPage('Error', `<div class="content"><p>Failed to save feedback. Please try again.</p></div>`, 500);
  }

  return renderPage('Thank You', `
    <div class="success">
      <div class="icon">🙏</div>
      <h2>Feedback Received!</h2>
      <p>Thanks for helping us improve the AI caller. Your input directly shapes how it handles future calls.</p>
      ${rating <= 2 ? '<p style="margin-top:12px; color:#64748b;">We\'ll prioritize fixing the issues you flagged.</p>' : ''}
    </div>`);
};

function renderPage(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} — Legacy Financial</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 560px; width: 100%; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e40af, #2563eb); padding: 20px 32px; text-align: center; }
    .header h1 { color: white; font-size: 16px; font-weight: 700; }
    .content { padding: 28px; }
    .content h2 { color: #1e293b; font-size: 20px; margin-bottom: 16px; }
    .call-meta { background: #f1f5f9; border-radius: 10px; padding: 16px; margin-bottom: 24px; }
    .meta-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; color: #334155; }
    .meta-label { font-weight: 600; color: #64748b; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-gray { background: #f1f5f9; color: #475569; }
    .form-group { margin-bottom: 20px; }
    .form-label { display: block; font-weight: 600; color: #1e293b; margin-bottom: 4px; font-size: 15px; }
    .form-hint { color: #64748b; font-size: 13px; margin-bottom: 8px; }
    .star-rating { display: flex; gap: 4px; direction: rtl; justify-content: flex-end; }
    .star input { display: none; }
    .star span { font-size: 32px; color: #cbd5e1; cursor: pointer; transition: color 0.1s; }
    .star input:checked ~ span, .star:hover span, .star:hover ~ .star span { color: #f59e0b; }
    .star-rating:not(:hover) .star input:checked ~ span { color: #f59e0b; }
    .checkbox-group { display: flex; flex-direction: column; gap: 8px; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #334155; cursor: pointer; }
    .checkbox-label input { width: 16px; height: 16px; accent-color: #2563eb; }
    textarea { width: 100%; padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; resize: vertical; font-family: inherit; }
    textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .submit-btn { width: 100%; padding: 14px; background: #2563eb; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .submit-btn:hover { background: #1d4ed8; }
    .success { text-align: center; padding: 40px 28px; }
    .success .icon { font-size: 48px; margin-bottom: 16px; }
    .success h2 { margin-bottom: 12px; }
    .success p { color: #475569; font-size: 15px; line-height: 1.6; }
    .footer { padding: 12px 28px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { color: #94a3b8; font-size: 11px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h1>Legacy Financial &amp; Life — Call QA</h1></div>
    ${body}
    <div class="footer"><p>Internal use only. Feedback helps improve our AI voice system.</p></div>
  </div>
</body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
