import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SENTINEL_URL = import.meta.env.OLLAMA_URL || '';
const SENTINEL_SECRET = import.meta.env.OLLAMA_SECRET || '';

/**
 * POST /api/quote-preview
 * Generate a quote assistant preview (dry run) by sending synthetic consumer data
 * through the LLM to see what the quote assistant would respond.
 *
 * Body: { name, age, zip, state, income, householdSize, tobacco, prescriptions, requestType, freeformMessage }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!SENTINEL_URL) {
    return json({ error: 'AI backend not configured' }, 503);
  }

  try {
    const body = await request.json();
    const {
      name = 'Jane Smith',
      age,
      dob,
      zip = '30301',
      state = 'GA',
      income,
      householdSize,
      tobacco = false,
      prescriptions = [],
      requestType = 'under_65',
      freeformMessage,
    } = body;

    // Build a synthetic inbound email as if the consumer sent it
    const consumerMessage = freeformMessage || buildSyntheticMessage({
      name, age, dob, zip, state, income, householdSize, tobacco, prescriptions, requestType,
    });

    // System prompt — same extraction + recommendation flow the real quote assistant uses
    const systemPrompt = buildQuotePreviewPrompt(requestType);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
      'X-OpenClaw-Client': 'quote-preview',
    };
    if (SENTINEL_SECRET) headers['Authorization'] = `Bearer ${SENTINEL_SECRET}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch(`${SENTINEL_URL}/api/chat`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: 'qwen3:30b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: consumerMessage },
          ],
          stream: false,
          think: false,
          options: { temperature: 0.4, num_predict: 2000 },
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        return json({ error: `AI backend error: ${res.status}`, detail: text }, 502);
      }

      const data = await res.json();
      const reply = data.message?.content || data.choices?.[0]?.message?.content || '';

      return json({
        consumerMessage,
        reply,
        requestType,
        model: 'qwen3:30b',
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return json({ error: 'AI request timed out (90s)' }, 504);
    }
    return json({ error: err.message || 'Request failed' }, 500);
  }
};

function buildSyntheticMessage(data: Record<string, any>): string {
  const parts: string[] = [];
  parts.push(`Hi, my name is ${data.name}.`);

  if (data.requestType === 'medicare') {
    parts.push(`I'm ${data.age || '65'} years old and looking for Medicare supplement options.`);
    if (data.zip) parts.push(`My zip code is ${data.zip}.`);
    if (data.prescriptions?.length) parts.push(`I currently take: ${data.prescriptions.join(', ')}.`);
    parts.push(`Can you help me compare plans?`);
  } else if (data.requestType === 'life') {
    parts.push(`I'm ${data.age || '35'} years old and interested in life insurance.`);
    if (data.state) parts.push(`I live in ${data.state}.`);
    parts.push(`I'm looking for a term life policy. ${data.tobacco ? 'I do use tobacco.' : 'I do not use tobacco.'}`);
    parts.push(`What options do you have?`);
  } else {
    // Under-65 ACA
    parts.push(`I'm ${data.age || '40'} years old and looking for health insurance options.`);
    if (data.zip) parts.push(`My zip code is ${data.zip}${data.state ? ` (${data.state})` : ''}.`);
    if (data.income) parts.push(`My household income is about $${data.income}/year${data.householdSize ? ` for a household of ${data.householdSize}` : ''}.`);
    if (data.tobacco) parts.push(`I am a tobacco user.`);
    if (data.prescriptions?.length) parts.push(`I take these medications: ${data.prescriptions.join(', ')}.`);
    parts.push(`What plans are available to me?`);
  }

  return parts.join(' ');
}

function buildQuotePreviewPrompt(requestType: string): string {
  const pathway = requestType === 'medicare' ? 'Medicare supplement' : requestType === 'life' ? 'life insurance' : 'ACA Marketplace (under 65)';

  return `You are a professional insurance plan comparison assistant for Legacy Financial & Life. A consumer has emailed asking about ${pathway} options.

Your task: Generate the EXACT email reply the quote assistant would send to this consumer.

Guidelines:
- If you have enough information (age/DOB, zip, income for ACA), present 3-5 realistic sample plan options with premiums, deductibles, and plan types. Use realistic but clearly-marked example data.
- If key information is missing, write a friendly follow-up email asking for the specific missing fields needed (DOB, zip, income, household size, etc.)
- Use language like "Here are the plan options we found" — NEVER "we recommend" or "our advice"
- For ACA: mention estimated APTC (subsidy) if income data is available
- For Medicare: explain Medigap vs Medicare Advantage options
- For Life: explain term vs whole life options appropriate for their age
- End with CTA: "If you'd like help enrolling, reply to this email or call us at (706) 333-5641."
- Include: "This plan comparison is for informational purposes only. Actual premiums and availability will be confirmed during enrollment with a licensed agent."
- Sign off as "Legacy Financial Plan Comparison Team"
- Do NOT say "recommend," "advise," or "we suggest" — use "options," "found," "available," "compare"
- Generate ONLY the email body (no subject line header)

/no_think`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
