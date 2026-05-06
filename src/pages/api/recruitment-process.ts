import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
// Use base model directly — legacy-messenger Modelfile has a chat system prompt that conflicts
const MODEL = import.meta.env.AI_RECRUITMENT_MODEL || 'qwen3:30b';
const TABLE = 'recruitment_prospects';

const SYSTEM_PROMPT = `You are a recruitment outreach specialist for Legacy Financial & Life, an insurance agency run by Tim & Beth Byrd.

About Legacy Financial & Life:
- Tim and Beth Byrd, 15+ years combined experience, 300+ policies sold
- Licensed states: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac, National Life Group, North American
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities
- Offers: mentorship, AI-powered tools, proven systems, weekly training, lead sharing

Given a recruit's profile, generate a personalized outreach email and call script.

EMAIL RULES:
- 150-250 words, warm, direct, peer-to-peer
- Personal hook → value prop → soft CTA
- Reference their state/experience if known
- NEVER use MLM language, income claims, "unlimited earning potential", "be your own boss"
- NEVER guarantee income or disparage their current agency
- Sound like Tim talking to a fellow professional

CALL SCRIPT RULES:
- 30-second opener, friendly and unhurried
- Include a voicemail version

RESPOND IN THIS EXACT JSON FORMAT (no markdown fencing, no other text):
{
  "email": {
    "subject": "Subject line",
    "body": "Email body with \\n for line breaks"
  },
  "callScript": {
    "opener": "Hi [Name], this is Tim Byrd from Legacy Financial...",
    "voicemail": "Hey [Name], this is Tim Byrd..."
  },
  "personalNotes": "Brief note to Tim about this recruit",
  "fitScore": 7,
  "fitReason": "Brief explanation"
}

/no_think`;

function stripThinking(text: string): string {
  // Strip all <think>...</think> blocks (including multiline)
  let result = text.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart();
  // Handle unclosed <think> tag — take everything after it until first {
  if (result.includes('<think>')) {
    const jsonStart = result.indexOf('{', result.indexOf('<think>'));
    if (jsonStart !== -1) return result.substring(jsonStart);
  }
  // Handle orphan </think> at start
  const thinkEnd = result.indexOf('</think>');
  if (thinkEnd !== -1) result = result.substring(thinkEnd + 8).trimStart();
  // Strip untagged thinking (lines before first {)
  if (result.length > 0 && result[0] !== '{') {
    const jsonStart = result.indexOf('{');
    if (jsonStart > 0) return result.substring(jsonStart);
  }
  return result;
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  // Remove any remaining think tags
  cleaned = cleaned.replace(/<\/?think>/g, '');
  // Find the outermost JSON object using bracket matching (respecting strings)
  const start = cleaned.indexOf('{');
  if (start === -1) return cleaned;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end !== -1) return cleaned.substring(start, end + 1);
  // Fallback to lastIndexOf
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace > start) return cleaned.substring(start, lastBrace + 1);
  return cleaned;
}

/**
 * Attempt to repair truncated JSON by closing unclosed strings, arrays, and objects.
 */
function repairTruncatedJson(text: string): string {
  let json = text.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') {
      if (inString) { inString = false; }
      else { inString = true; }
      continue;
    }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (inString) {
    if (json.endsWith('\\')) json = json.slice(0, -1);
    json += '"';
  }
  json = json.replace(/,\s*$/, '');
  while (stack.length > 0) {
    json += stack.pop();
  }
  return json;
}

/**
 * Try multiple approaches to parse AI JSON output, handling truncation gracefully.
 * Returns parsed object or null if all attempts fail.
 */
function robustJsonParse(rawContent: string): Record<string, unknown> | null {
  const cleaned = stripThinking(rawContent);

  // Attempt 1: Direct parse (works for complete, compact JSON)
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Attempt 2: Extract JSON region and parse
  const extracted = extractJson(cleaned);
  try {
    return JSON.parse(extracted);
  } catch { /* continue */ }

  // Attempt 3: Repair the FULL cleaned content (not just extracted portion)
  // This handles truncation better because extractJson's lastIndexOf('}') fallback
  // may cut off later fields that repairTruncatedJson could recover
  try {
    return JSON.parse(repairTruncatedJson(cleaned));
  } catch { /* continue */ }

  // Attempt 4: Repair the extracted portion
  try {
    return JSON.parse(repairTruncatedJson(extracted));
  } catch { /* continue */ }

  // Attempt 5: Aggressive cleanup then repair
  try {
    let aggressive = cleaned
      .replace(/,\s*([}\]])/g, '$1')    // trailing commas
      .replace(/(\w+)\s*:/g, '"$1":');  // unquoted keys
    return JSON.parse(repairTruncatedJson(aggressive));
  } catch { /* continue */ }

  return null;
}

/**
 * POST /api/recruitment-process
 * Process a batch of pending prospects through the AI.
 * Body: { prospectIds?: string[], limit?: number }
 * If prospectIds provided, processes those. Otherwise processes next N pending.
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
    const batchLimit = Math.min(parseInt(body.limit) || 5, 20);
    const prospectIds: string[] | undefined = body.prospectIds;

    // Fetch prospects to process
    let queryUrl = `${SUPABASE_URL}/rest/v1/${TABLE}?status=eq.pending&processed_at=is.null&order=created_at.asc&limit=${batchLimit}`;
    if (prospectIds && Array.isArray(prospectIds) && prospectIds.length > 0) {
      const ids = prospectIds.slice(0, 20).map(id => String(id));
      queryUrl = `${SUPABASE_URL}/rest/v1/${TABLE}?id=in.(${ids.join(',')})&status=eq.pending`;
    }

    const fetchRes = await fetch(queryUrl, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!fetchRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch prospects' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prospects = await fetchRes.json();
    if (prospects.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No pending prospects to process' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results: { id: string; success: boolean; fitScore?: number }[] = [];

    // Process each prospect sequentially (GPU constraint)
    for (const prospect of prospects) {
      try {
        const result = await processProspect(prospect);
        results.push({ id: prospect.id, success: true, fitScore: result.fitScore });
      } catch (err) {
        console.error(`Failed to process prospect ${prospect.id}:`, err);
        results.push({ id: prospect.id, success: false });
      }
    }

    return new Response(JSON.stringify({
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Recruitment process error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

async function processProspect(prospect: Record<string, unknown>): Promise<{ fitScore: number }> {
  const profile = buildProfileDescription(prospect);

  const ollamaHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  };
  if (OLLAMA_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OLLAMA_SECRET}`;
  ollamaHeaders['X-OpenClaw-Client'] = 'recruitment';

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: ollamaHeaders,
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Generate recruitment outreach for this prospect:\n\n${profile}` },
      ],
      stream: false,
      think: false,
      format: 'json',
      options: { temperature: 0.7, top_p: 0.9, num_predict: 8192, num_ctx: 16384 },
    }),
  });

  if (!ollamaRes.ok) {
    const errText = await ollamaRes.text().catch(() => '');
    throw new Error(`Ollama returned ${ollamaRes.status}: ${errText.slice(0, 200)}`);
  }

  const ollamaData = await ollamaRes.json();
  const rawContent = ollamaData?.message?.content || ollamaData?.response || '';

  if (!rawContent || rawContent.trim().length < 10) {
    console.error('AI returned empty/minimal response:', JSON.stringify(ollamaData).slice(0, 500));
    throw new Error('AI returned empty response — model may need reload');
  }

  const parsed = robustJsonParse(rawContent);
  if (!parsed) {
    console.error('All JSON parse attempts failed. Raw (500 chars):', rawContent.slice(0, 500));
    throw new Error('Failed to parse AI response as JSON');
  }

  const email = parsed.email as Record<string, string> | undefined;
  const callScript = parsed.callScript as Record<string, string> | undefined;
  const fitScore = Math.min(10, Math.max(1, parseInt(String(parsed.fitScore)) || 5));

  // Update the prospect in Supabase
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${prospect.id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        fit_score: fitScore,
        fit_reason: String(parsed.fitReason || '').slice(0, 500),
        email_subject: String(email?.subject || '').slice(0, 200),
        email_body: String(email?.body || '').slice(0, 5000),
        call_script: String(callScript?.opener || '').slice(0, 2000),
        voicemail_script: String(callScript?.voicemail || '').slice(0, 1000),
        personal_notes: String(parsed.personalNotes || '').slice(0, 1000),
        processed_at: new Date().toISOString(),
        status: 'processed',
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.text().catch(() => '');
    throw new Error(`Failed to update prospect: ${updateRes.status} ${err}`);
  }

  return { fitScore };
}

function buildProfileDescription(prospect: Record<string, unknown>): string {
  const parts: string[] = [];
  if (prospect.name) parts.push(`Name: ${prospect.name}`);
  if (prospect.state) parts.push(`State: ${prospect.state}`);
  if (prospect.city) parts.push(`City: ${prospect.city}`);
  if (prospect.experience_level && prospect.experience_level !== 'unknown') {
    parts.push(`Experience: ${prospect.experience_level}`);
  }
  if (prospect.current_agency) parts.push(`Current Agency: ${prospect.current_agency}`);
  if (prospect.email) parts.push(`Email: ${prospect.email}`);
  if (prospect.phone) parts.push(`Phone: ${prospect.phone}`);
  if (prospect.notes) parts.push(`Notes: ${prospect.notes}`);
  return parts.join('\n') || 'Minimal profile information available.';
}
