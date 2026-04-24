import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'qwen3:30b';

const SYSTEM_PROMPT = `You are a Facebook engagement analyst for Legacy Financial & Life, an insurance agency run by Tim and Beth Byrd in Luthersville, Georgia.

Your job is to analyze a Facebook post and determine:
1. How good an opportunity it is for Tim or Beth to comment
2. What approach they should take
3. Draft 2 reply options in Tim/Beth's voice

About Legacy Financial & Life:
- Tim and Beth Byrd, Luthersville, Georgia
- 15+ years combined experience, 300+ policies sold in 2 years
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities, Estate Planning
- Licensed in: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac
- Booking: https://app.ringy.com/book/legacy
- Phone: (706) 333-5641

IDEAL engagement opportunities:
- People asking about/discussing life insurance, final expense, retirement
- People sharing stories about financial hardship after losing a loved one
- Small business owners asking about benefits, estate planning
- Parents discussing financial planning for families
- People in insurance-related Facebook groups asking questions
- Posts expressing confusion or frustration about insurance

BAD engagement opportunities (score low):
- Posts by competitors or other agents soliciting business
- Political arguments or heated debates
- Posts with many agents already commenting / saturated
- Off-topic posts with no natural connection to insurance
- Posts in groups with strict no-solicitation rules

RESPOND IN THIS EXACT JSON FORMAT (no other text, no markdown fencing):
{
  "score": <1-10 integer>,
  "rationale": "<1-2 sentences explaining why this is/isn't a good opportunity>",
  "approach": "<brief strategy: empathetic, educational, redirect-to-DM, etc.>",
  "risk": "<low|medium|high — risk of the comment being seen as spammy or inappropriate>",
  "drafts": [
    {
      "text": "<draft reply text, 2-4 sentences>",
      "tone": "<empathetic|educational|encouraging|conversational>",
      "hasCta": <true|false — whether it includes a soft call to action>
    },
    {
      "text": "<alternative draft>",
      "tone": "<tone label>",
      "hasCta": <true|false>
    }
  ]
}

Rules for drafts:
- Sound like Tim or Beth personally, NOT a corporation or AI
- Keep replies to 2-4 sentences max
- Warm, personal tone — like a knowledgeable neighbor
- NEVER quote premiums, rates, or dollar amounts
- NEVER disparage competitors
- NEVER make guaranteed return or investment claims
- NEVER output chain-of-thought, internal reasoning, or meta-commentary
- Only include a soft CTA when it feels natural (not forced)`;

function stripThinking(text: string): string {
  const thinkEnd = text.indexOf('</think>');
  if (thinkEnd !== -1) {
    return text.substring(thinkEnd + 8).trimStart();
  }
  return text;
}

function extractJson(text: string): string {
  // Try to find JSON object in the response
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1);
  }
  return text;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const requestStart = Date.now();
    const body = await request.json();
    const { postText, groupName, authorInfo } = body;

    if (!postText || typeof postText !== 'string' || postText.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Post text required (min 10 characters)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sanitizedPost = String(postText).slice(0, 2000);
    const context = [
      groupName ? `Facebook Group: ${String(groupName).slice(0, 200)}` : '',
      authorInfo ? `Author context: ${String(authorInfo).slice(0, 200)}` : '',
    ].filter(Boolean).join('\n');

    const userPrompt = `Analyze this Facebook post for engagement potential:\n\n${context ? context + '\n\n' : ''}Post:\n"${sanitizedPost}"`;

    const ollamaHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    };
    if (OLLAMA_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OLLAMA_SECRET}`;

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: ollamaHeaders,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt + ' /no_think' },
        ],
        stream: false,
        keep_alive: '30m',
        options: {
          temperature: 0.6,
          top_p: 0.9,
          num_predict: 1024,
        },
      }),
    });

    if (!ollamaRes.ok) {
      return new Response(JSON.stringify({ error: 'AI model unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ollamaData = await ollamaRes.json();
    const raw = ollamaData.message?.content || '';
    const cleaned = stripThinking(raw);
    const jsonStr = extractJson(cleaned);

    const promptTokens = ollamaData.prompt_eval_count || 0;
    const completionTokens = ollamaData.eval_count || 0;
    const latencyMs = Date.now() - requestStart;

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      // If JSON parse fails, return structured error with raw text
      trackLeadEvent({
        route: '/api/ai-scout',
        eventName: 'ai_scout_analysis',
        source: 'server',
        stage: 'submission',
        status: 'warning',
        ownerScope: 'legacy',
        provider: MODEL,
        properties: {
          model: MODEL,
          parse_error: true,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          latency_ms: latencyMs,
        },
      }).catch(() => {});

      return new Response(JSON.stringify({
        error: 'Could not parse AI analysis',
        rawResponse: cleaned.slice(0, 500),
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Track successful analysis
    trackLeadEvent({
      route: '/api/ai-scout',
      eventName: 'ai_scout_analysis',
      source: 'server',
      stage: 'submission',
      status: 'success',
      ownerScope: 'legacy',
      provider: MODEL,
      properties: {
        model: MODEL,
        score: analysis.score,
        risk: analysis.risk,
        draft_count: analysis.drafts?.length || 0,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        latency_ms: latencyMs,
      },
    }).catch(() => {});

    return new Response(JSON.stringify({
      score: analysis.score,
      rationale: analysis.rationale,
      approach: analysis.approach,
      risk: analysis.risk,
      drafts: analysis.drafts || [],
      meta: {
        model: MODEL,
        tokens: promptTokens + completionTokens,
        latencyMs,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
