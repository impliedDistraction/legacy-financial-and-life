import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
// Use base model directly — legacy-messenger Modelfile has a chat system prompt that conflicts
const MODEL = import.meta.env.AI_RECRUITMENT_MODEL || 'qwen3:30b';

const BASE_SYSTEM_PROMPT = `You are a recruitment outreach specialist for Legacy Financial & Life, an insurance agency.

About Legacy Financial & Life:
- Tim and Beth Byrd, 300+ policies sold
- Licensed states: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac, National Life Group, North American
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities
- Offers: mentorship, AI-powered tools, proven systems, weekly training, lead sharing

Given a recruit's profile, generate a personalized outreach email and call script.

EMAIL RULES:
- 150-250 words, warm, direct, professional
- Brief intro → value prop → soft CTA
- Reference their state/experience if known
- Write as a recruiter introducing the Legacy Financial team — NOT from any individual's first-person perspective
- The sign-off will be provided in the user message as SIGN_OFF — use that exact text at the end of the email
- NEVER use placeholder brackets like [Your Name], [Name], [Company], etc. — always use actual values
- Use the prospect's actual first name in the greeting (e.g., "Hi Juan," not "Hi [Name],")
- NEVER reference specific meeting topics or fabricate shared experiences
- NEVER mention how many years anyone has been in the business or any specific duration of experience
- NEVER use MLM language, income claims, "unlimited earning potential", "be your own boss"
- NEVER guarantee income or disparage their current agency

CALL SCRIPT RULES:
- 30-second opener, friendly, unhurried, to the point
- Include a voicemail version
- Use the prospect's actual first name — NEVER use [Name] or any bracket placeholders
- Do NOT fabricate meeting contexts or claim to have met the prospect
- Do NOT mention years of experience — focus on what the team offers
- Voicemail must include callback number: (561) 365-4523

RESPOND IN THIS EXACT JSON FORMAT (no markdown fencing, no other text):
{
  "email": {
    "subject": "Subject line",
    "body": "Email body with \\n for line breaks"
  },
  "callScript": {
    "opener": "Hi Juan, this is the Legacy Financial recruiting team...",
    "voicemail": "Hey Juan, this is Legacy Financial & Life..."
  },
  "personalNotes": "Brief note about this recruit",
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
 * This handles the common case where AI output is cut off mid-generation.
 */
function repairTruncatedJson(text: string): string {
  // Escape raw control chars in string values first
  let json = text.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  // Walk through to figure out what's unclosed
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

  // If we're still inside a string, close it
  if (inString) {
    // Remove trailing backslash if present (broken escape)
    if (json.endsWith('\\')) json = json.slice(0, -1);
    json += '"';
  }

  // Remove trailing comma after closing the string
  json = json.replace(/,\s*$/, '');

  // Close any remaining open brackets/braces
  while (stack.length > 0) {
    json += stack.pop();
  }

  return json;
}

/**
 * Try multiple approaches to parse AI JSON output, handling truncation gracefully.
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

  // Attempt 3: Repair the FULL cleaned content (handles truncation best)
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
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/(\w+)\s*:/g, '"$1":');
    return JSON.parse(repairTruncatedJson(aggressive));
  } catch { /* continue */ }

  return null;
}

/**
 * POST /api/recruitment-preview
 * Dry-run: processes a prospect through AI without storing anything.
 * Used for the test/preview tab so Tim can see what would go out.
 * Body: { prospect: {...}, feedback?: string[] }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { prospect, feedback, signOff } = body;

    if (!prospect?.name) {
      return new Response(JSON.stringify({ error: 'Prospect name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build system prompt with optional feedback adjustments
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (Array.isArray(feedback) && feedback.length > 0) {
      const adjustments = feedback
        .slice(0, 10)
        .map((f: unknown) => String(f).slice(0, 200))
        .join('\n- ');
      systemPrompt += `\n\nADDITIONAL GUIDELINES (from feedback):\n- ${adjustments}`;
    }

    // Build prospect profile with sign-off instruction
    const emailSignOff = String(signOff || 'Legacy Financial Recruiting Team').slice(0, 200);
    const profile = buildProfile(prospect);
    const userMessage = `Generate recruitment outreach for this prospect:\n\n${profile}\n\nSIGN_OFF: Best,\\n${emailSignOff}`;


    const ollamaHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
      'X-OpenClaw-Client': 'recruitment',
    };
    if (OLLAMA_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OLLAMA_SECRET}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110_000); // 110s — just under maxDuration

    let ollamaRes: Response;
    try {
      ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: ollamaHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0.7, top_p: 0.9, num_predict: 2048, num_ctx: 4096 },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!ollamaRes.ok) {
      const status = ollamaRes.status;
      const errBody = await ollamaRes.text().catch(() => '');
      const detail = errBody.slice(0, 200);
      return new Response(JSON.stringify({ error: `AI model returned ${status}: ${detail || 'Is it running?'}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ollamaData = await ollamaRes.json();
    const rawContent = ollamaData?.message?.content || ollamaData?.response || '';

    const parsed = robustJsonParse(rawContent);
    if (!parsed) {
      return new Response(JSON.stringify({
        error: 'AI returned malformed response. Try again.',
        raw: rawContent.slice(0, 800),
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return the generated content - never store test domain prospects
    return new Response(JSON.stringify({
      email: parsed.email,
      callScript: parsed.callScript,
      personalNotes: parsed.personalNotes,
      fitScore: Math.min(10, Math.max(1, parseInt(String(parsed.fitScore)) || 5)),
      fitReason: parsed.fitReason,
      isTest: String(prospect.email || '').endsWith('@test.legacy'),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Recruitment preview error:', msg);
    const isAbort = msg.includes('abort') || (err instanceof Error && err.name === 'AbortError');
    const isNetwork = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('network');
    const errorMsg = isAbort
      ? 'AI generation timed out (model too slow). The model is running but needs more time than allowed.'
      : isNetwork
        ? `Network error reaching AI: ${msg}`
        : 'Request failed';
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: isAbort ? 504 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function buildProfile(prospect: Record<string, unknown>): string {
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

  // Include research findings if available
  const wp = prospect.web_presence as Record<string, unknown> | undefined;
  if (wp && Object.keys(wp).length > 0) {
    parts.push('');
    parts.push('--- RESEARCH FINDINGS ---');
    if (prospect.research_score) parts.push(`Research Score: ${prospect.research_score}/10`);
    if (wp.summary) parts.push(`Summary: ${wp.summary}`);
    if (wp.linkedin) parts.push(`LinkedIn: ${wp.linkedin}`);
    if (Array.isArray(wp.websites) && wp.websites.length) parts.push(`Websites: ${wp.websites.join(', ')}`);
    if (Array.isArray(wp.signals) && wp.signals.length) parts.push(`Signals: ${wp.signals.join(', ')}`);
    if (wp.notes) parts.push(`Research Notes: ${wp.notes}`);
  }

  return parts.join('\n') || 'Minimal profile information available.';
}
