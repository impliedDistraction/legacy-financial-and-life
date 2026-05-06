import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
// Use base model directly — legacy-messenger Modelfile has a chat system prompt that conflicts
const MODEL = import.meta.env.AI_RECRUITMENT_MODEL || 'qwen3:30b';

const BASE_SYSTEM_PROMPT = `You are a recruitment outreach specialist for Legacy Financial & Life, an insurance agency run by Tim & Beth Byrd.

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
    const { prospect, feedback } = body;

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
      systemPrompt += `\n\nADDITIONAL GUIDELINES (from Tim's feedback):\n- ${adjustments}`;
    }

    // Build prospect profile
    const profile = buildProfile(prospect);

    const ollamaHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
      'X-OpenClaw-Client': 'recruitment',
    };
    if (OLLAMA_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OLLAMA_SECRET}`;

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: ollamaHeaders,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate recruitment outreach for this prospect:\n\n${profile}` },
        ],
        stream: false,
        think: false,
        format: 'json',
        options: { temperature: 0.7, top_p: 0.9, num_predict: 4096 },
      }),
    });

    if (!ollamaRes.ok) {
      const status = ollamaRes.status;
      return new Response(JSON.stringify({ error: `AI model returned ${status}. Is it running?` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ollamaData = await ollamaRes.json();
    const rawContent = ollamaData?.message?.content || ollamaData?.response || '';
    const cleaned = stripThinking(rawContent);
    const jsonStr = extractJson(cleaned);

    let parsed: Record<string, unknown>;
    try {
      // Repair common JSON issues: unescaped newlines/tabs inside string values
      const repaired = jsonStr.replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
      });
      parsed = JSON.parse(repaired);
    } catch (firstErr) {
      // Second pass: try fixing trailing commas and other common issues
      try {
        let retry = jsonStr
          .replace(/[\x00-\x1f]/g, (ch) => {
            if (ch === '\n') return '\\n';
            if (ch === '\r') return '\\r';
            if (ch === '\t') return '\\t';
            return '';
          })
          .replace(/,\s*([}\]])/g, '$1')       // trailing commas
          .replace(/'/g, '"')                   // single quotes → double
          .replace(/(\w+)\s*:/g, '"$1":');      // unquoted keys
        parsed = JSON.parse(retry);
      } catch {
        return new Response(JSON.stringify({
          error: 'AI returned malformed response. Try again.',
          raw: rawContent.slice(0, 800),
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
    console.error('Recruitment preview error:', err);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
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
  return parts.join('\n') || 'Minimal profile information available.';
}
