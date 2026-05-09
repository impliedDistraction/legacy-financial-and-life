import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const OPENCLAW_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OPENCLAW_SECRET = import.meta.env.OLLAMA_SECRET || '';
const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const MODEL = import.meta.env.AI_RECRUITMENT_MODEL || 'qwen3:30b';
const TABLE = 'recruitment_prospects';

/**
 * POST /api/recruitment-pipeline
 * Manually trigger pipeline stages: outreach generation, review, or research.
 * Body: { action: 'outreach' | 'review' | 'research', limit?: number }
 *
 * For outreach, this processes pending prospects through AI right here
 * (since the worker runs on OpenClaw side, we replicate the logic server-side).
 * For review/research, we just trigger the counts since those are lightweight.
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { action, limit = 5 } = body;

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    if (action === 'outreach') {
      // Fetch pending prospects and process them through AI
      const fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.pending&processed_at=is.null&order=created_at.asc&limit=${Math.min(limit, 10)}&select=*`,
        { headers }
      );
      if (!fetchRes.ok) {
        return json({ error: 'Failed to fetch pending prospects' }, 500);
      }
      const prospects = await fetchRes.json();
      if (prospects.length === 0) {
        return json({ processed: 0, message: 'No pending prospects' });
      }

      let processed = 0;
      let failed = 0;

      for (const prospect of prospects) {
        try {
          const result = await generateOutreach(prospect);
          if (result) {
            await updateProspectOutreach(prospect.id, result);
            processed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      return json({ processed, failed, total: prospects.length });

    } else if (action === 'review') {
      // Trigger QA + review for drafted prospects (actual QA runs via sentinel cron)
      // This endpoint reports current pipeline state
      const draftedRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.drafted&select=id`,
        { headers: { ...headers, Prefer: 'count=exact' } }
      );
      const draftedRange = draftedRes.headers.get('content-range');
      const drafted = draftedRange ? parseInt(draftedRange.split('/')[1]) : 0;

      const reviewedRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.reviewed&select=id`,
        { headers: { ...headers, Prefer: 'count=exact' } }
      );
      const reviewedRange = reviewedRes.headers.get('content-range');
      const reviewed = reviewedRange ? parseInt(reviewedRange.split('/')[1]) : 0;

      return json({ drafted, reviewed, message: `${drafted} awaiting QA, ${reviewed} awaiting approval (QA + review run on cron cycle)` });

    } else if (action === 'research') {
      // Count unscored and report (actual research runs on OpenClaw cron)
      const fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?research_status=eq.unscored&select=id`,
        { headers: { ...headers, Prefer: 'count=exact' } }
      );
      const range = fetchRes.headers.get('content-range');
      const unscored = range ? parseInt(range.split('/')[1]) : 0;

      // Mark some as needing research to trigger on next cron cycle
      return json({ processed: 0, unscored, message: `${unscored} prospects queued for research (runs on next cron cycle)` });

    } else {
      return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('Pipeline error:', err);
    return json({ error: 'Request failed' }, 400);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Outreach generation (inline, minimal) ───────────────────────────

const SYSTEM_PROMPT = `You are a recruitment outreach specialist for Legacy Financial & Life, an insurance agency.

About Legacy Financial & Life:
- Tim and Beth Byrd, 300+ policies sold
- Licensed states: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac, National Life Group, North American
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities
- Offers: mentorship, AI-powered tools, proven systems, weekly training, lead sharing

Generate a personalized outreach email and call script.

EMAIL RULES:
- 150-250 words, warm, direct, professional
- Brief intro → value prop → soft CTA
- Write as a recruiter introducing the Legacy Financial team
- The sign-off will be provided as SIGN_OFF — use it exactly
- NEVER use placeholder brackets — always use actual values
- Use the prospect's actual first name
- NEVER use MLM language, income claims, or guarantee income
- The CTA should direct them to: CTA_LINK (provided in the user message)

CALL SCRIPT RULES:
- 30-second opener, friendly, to the point
- Include a voicemail version with callback: (561) 365-4523

RESPOND IN THIS EXACT JSON FORMAT:
{
  "email": { "subject": "Subject line", "body": "Email body" },
  "callScript": { "opener": "...", "voicemail": "..." },
  "personalNotes": "Brief note",
  "fitScore": 7,
  "fitReason": "Brief explanation"
}

/no_think`;

async function generateOutreach(prospect: Record<string, unknown>) {
  const parts: string[] = [];
  if (prospect.name) parts.push(`Name: ${prospect.name}`);
  if (prospect.state) parts.push(`State: ${prospect.state}`);
  if (prospect.city) parts.push(`City: ${prospect.city}`);
  if (prospect.email) parts.push(`Email: ${prospect.email}`);
  if (prospect.current_agency) parts.push(`Current Agency: ${prospect.current_agency}`);
  const profile = parts.join('\n') || 'Minimal profile';

  const ctaLink = `https://legacyfinancial.app/join?pid=${prospect.id}`;
  const userMessage = `Generate recruitment outreach for this prospect:\n\n${profile}\n\nSIGN_OFF: Best,\\nLegacy Financial Recruiting Team\nCTA_LINK: ${ctaLink}`;

  const ollamaHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
    'X-OpenClaw-Client': 'recruitment',
  };
  if (OPENCLAW_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OPENCLAW_SECRET}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110_000);

  try {
    const res = await fetch(`${OPENCLAW_URL}/api/chat`, {
      method: 'POST',
      headers: ollamaHeaders,
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        think: false,
        format: 'json',
        options: { temperature: 0.7, top_p: 0.9, num_predict: 2048, num_ctx: 4096 },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.message?.content || '';
    if (!raw || raw.length < 20) return null;

    // Extract JSON
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return JSON.parse(cleaned.substring(start, end + 1));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function updateProspectOutreach(id: string, result: Record<string, unknown>) {
  const email = result.email as Record<string, string> | undefined;
  const callScript = result.callScript as Record<string, string> | undefined;
  const fitScore = Math.min(10, Math.max(1, parseInt(String(result.fitScore)) || 5));

  await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      fit_score: fitScore,
      fit_reason: String(result.fitReason || '').slice(0, 500),
      email_subject: String(email?.subject || '').slice(0, 200),
      email_body: String(email?.body || '').slice(0, 5000),
      call_opener: String(callScript?.opener || '').slice(0, 2000),
      call_voicemail: String(callScript?.voicemail || '').slice(0, 1000),
      personal_notes: String(result.personalNotes || '').slice(0, 1000),
      processed_at: new Date().toISOString(),
      status: 'drafted',
      updated_at: new Date().toISOString(),
    }),
  });
}
