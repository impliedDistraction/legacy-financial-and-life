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

/**
 * Render a minimal branded HTML page for survey interactions.
 */
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
    .content p { color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
    .question { margin: 24px 0; padding: 20px; background: #f1f5f9; border-radius: 12px; }
    .question-text { font-size: 17px; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
    .options { display: flex; flex-direction: column; gap: 10px; }
    .option-btn { display: block; padding: 14px 20px; background: white; border: 2px solid #e2e8f0; border-radius: 10px; color: #334155; font-size: 15px; font-weight: 500; text-decoration: none; text-align: center; transition: all 0.15s; }
    .option-btn:hover { border-color: #2563eb; background: #eff6ff; color: #1e40af; }
    .success { text-align: center; padding: 40px 32px; }
    .success .icon { font-size: 48px; margin-bottom: 16px; }
    .scale-options { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .scale-btn { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: center; text-decoration: none; font-weight: 600; color: #334155; font-size: 16px; transition: all 0.15s; }
    .scale-btn:hover { border-color: #2563eb; background: #2563eb; color: white; }
    .footer { padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h1>Legacy Financial &amp; Life</h1></div>
    ${body}
    <div class="footer"><p>Your responses are confidential and used for industry research only.</p></div>
  </div>
</body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * GET /api/survey-response?pid={prospectId}&token={hmac}&cid={campaignId}&qid={questionId}&a={answerValue}
 *
 * One-click survey response from email. Records the answer and shows the next question
 * (or thank-you page if all questions answered).
 *
 * If qid is omitted, shows the first unanswered question for this prospect+campaign.
 */
export const GET: APIRoute = async ({ url }) => {
  const pid = url.searchParams.get('pid');
  const token = url.searchParams.get('token');
  const cid = url.searchParams.get('cid');
  const qid = url.searchParams.get('qid');
  const answer = url.searchParams.get('a');

  // Validate required params
  if (!pid || !token || !cid) {
    return renderPage('Invalid Link', `
      <div class="content">
        <h2>Invalid Survey Link</h2>
        <p>This link appears to be incomplete or expired. If you received this in an email, please try clicking the link again.</p>
      </div>`, 400);
  }

  // Verify HMAC token (same system as unsubscribe — prevents forgery)
  const valid = await verifyToken(pid, token);
  if (!valid) {
    return renderPage('Invalid Link', `
      <div class="content">
        <h2>Invalid Link</h2>
        <p>This survey link could not be verified. It may have expired or been modified.</p>
      </div>`, 403);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return renderPage('Error', `<div class="content"><p>Service temporarily unavailable.</p></div>`, 503);
  }

  // Fetch campaign + questions
  const [campRes, questionsRes] = await Promise.all([
    supa(`survey_campaigns?id=eq.${encodeURIComponent(cid)}&limit=1`),
    supa(`survey_questions?campaign_id=eq.${encodeURIComponent(cid)}&order=question_order.asc`),
  ]);

  if (!campRes.ok || !questionsRes.ok) {
    return renderPage('Error', `<div class="content"><p>Could not load survey. Please try again later.</p></div>`, 500);
  }

  const [campaign] = await campRes.json();
  const questions = await questionsRes.json();

  if (!campaign || questions.length === 0) {
    return renderPage('Survey Not Found', `
      <div class="content">
        <h2>Survey Not Available</h2>
        <p>This survey may have been completed or is no longer active. Thank you for your interest.</p>
      </div>`, 404);
  }

  // If an answer was provided, record it
  if (qid && answer !== null && answer !== undefined) {
    // Validate that qid belongs to this campaign
    const questionExists = questions.find((q: any) => q.id === qid);
    if (questionExists) {
      // Upsert response (ON CONFLICT updates)
      await supa('survey_responses', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          campaign_id: cid,
          question_id: qid,
          prospect_id: pid,
          answer_value: answer,
          answered_at: new Date().toISOString(),
          properties: { response_method: 'email_click' },
        }),
      });

      // Mark survey_sends as responded (check if already responded to avoid double-counting)
      const sendCheckRes = await supa(
        `survey_sends?campaign_id=eq.${encodeURIComponent(cid)}&prospect_id=eq.${encodeURIComponent(pid)}&select=id,responded&limit=1`
      );
      const [sendRecord] = sendCheckRes.ok ? await sendCheckRes.json() : [null];
      const isFirstResponse = sendRecord && !sendRecord.responded;

      if (sendRecord) {
        await supa(`survey_sends?id=eq.${encodeURIComponent(sendRecord.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            responded: true,
            responded_at: new Date().toISOString(),
          }),
        });
      }

      // Only increment response_count for first-time respondents (not per-answer)
      if (isFirstResponse) {
        // Use raw SQL via PostgREST rpc for atomic increment (avoids race condition)
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_survey_response_count`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id_input: cid }),
        });
      }

      // Update prospect engagement tracking
      await supa(`recruitment_prospects?id=eq.${encodeURIComponent(pid)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          updated_at: new Date().toISOString(),
          interaction_stage: 'survey_engaged',
        }),
      });
    }
  }

  // Find existing responses for this prospect+campaign
  const existingRes = await supa(
    `survey_responses?campaign_id=eq.${encodeURIComponent(cid)}&prospect_id=eq.${encodeURIComponent(pid)}&select=question_id`
  );
  const existing = existingRes.ok ? await existingRes.json() : [];
  const answeredIds = new Set(existing.map((r: any) => r.question_id));

  // Find the next unanswered question
  const nextQuestion = questions.find((q: any) => !answeredIds.has(q.id));

  // All done — show thank you
  if (!nextQuestion) {
    return renderPage('Thank You', `
      <div class="success">
        <div class="icon">🙏</div>
        <h2>Thank you for your input!</h2>
        <p>Your responses help us understand the real challenges facing insurance agents today.</p>
        <p style="margin-top: 16px; font-weight: 500;">We'll share the results with you before they're published — watch your inbox.</p>
      </div>`);
  }

  // Build the response URL base for answer links
  const baseUrl = `${url.origin}/api/survey-response?pid=${encodeURIComponent(pid)}&token=${encodeURIComponent(token)}&cid=${encodeURIComponent(cid)}&qid=${encodeURIComponent(nextQuestion.id)}`;

  // Render the question
  const options = nextQuestion.options || [];
  let optionsHtml = '';

  if (nextQuestion.question_type === 'scale') {
    optionsHtml = `<div class="scale-options">`;
    for (const opt of options) {
      optionsHtml += `<a class="scale-btn" href="${baseUrl}&a=${encodeURIComponent(opt.value)}">${escHtml(opt.label)}</a>`;
    }
    optionsHtml += `</div>`;
  } else {
    optionsHtml = `<div class="options">`;
    for (const opt of options) {
      optionsHtml += `<a class="option-btn" href="${baseUrl}&a=${encodeURIComponent(opt.value)}">${escHtml(opt.label)}</a>`;
    }
    optionsHtml += `</div>`;
  }

  const progress = `Question ${answeredIds.size + 1} of ${questions.length}`;

  return renderPage('Survey', `
    <div class="content">
      <p style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">${progress}</p>
      <div class="question">
        <div class="question-text">${escHtml(nextQuestion.question_text)}</div>
        ${optionsHtml}
      </div>
    </div>`);
};

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
