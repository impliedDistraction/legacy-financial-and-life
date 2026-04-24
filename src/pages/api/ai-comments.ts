import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'qwen3:30b';

const SYSTEM_PROMPT = `You are a social media assistant for Legacy Financial & Life, an insurance agency run by Tim and Beth Byrd in Luthersville, Georgia.

Your job is to draft reply comments to Facebook posts and ads for Tim and Beth to review before posting. Your drafts should sound like they come from Tim or Beth personally — not a corporation and not an AI.

About Legacy Financial & Life:
- Tim and Beth Byrd, Luthersville, Georgia
- 15+ years combined experience, 300+ policies sold in 2 years
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities, Estate Planning
- Licensed in: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac
- Booking: https://app.ringy.com/book/legacy
- Phone: (706) 333-5641

Rules:
- Keep replies to 2-4 sentences
- Write as Tim, Beth, or "we"
- Warm, personal tone — like a knowledgeable neighbor
- Soft call-to-action when appropriate (not every reply)
- NEVER quote premiums, rates, or dollar amounts
- NEVER disparage competitors
- NEVER make guaranteed return claims
- NEVER output internal reasoning or chain-of-thought. Begin your reply draft directly.`;

function stripThinking(text: string): string {
  const thinkEnd = text.indexOf('</think>');
  if (thinkEnd !== -1) {
    return text.substring(thinkEnd + 8).trimStart();
  }
  return text;
}

function stripUntaggedThinking(text: string): string {
  const thinkingPrefixes = /^(okay|hmm|so|well|let me|the user|i need|i should|i think|first|now|alright|right)/i;
  const lines = text.split('\n');
  if (!thinkingPrefixes.test(lines[0].trim())) return text;

  // Look for the actual draft — typically starts without meta-commentary
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Blank line followed by the actual draft content
    if (trimmed === '' && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      // Draft lines typically don't start with thinking patterns
      if (next && !thinkingPrefixes.test(next)) {
        return lines.slice(i + 1).join('\n').trimStart();
      }
    }
  }
  return text;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const comments: string[] = body.comments;

    if (!comments || !Array.isArray(comments) || comments.length === 0 || comments.length > 10) {
      return new Response(JSON.stringify({ error: 'Provide 1-10 comments' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const batchStart = Date.now();

    for (const comment of comments) {
      const sanitized = String(comment).slice(0, 500);

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
            { role: 'user', content: `Draft a reply to this Facebook comment:\n\n"${sanitized}" /no_think` },
          ],
          stream: false,
          keep_alive: '30m',
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 512,
          },
        }),
      });

      if (!ollamaRes.ok) {
        results.push({ comment: sanitized, draft: 'Error generating draft', error: true });
        continue;
      }

      const data = await ollamaRes.json();
      const raw = data.message?.content || '';
      const cleaned = stripUntaggedThinking(stripThinking(raw));

      totalPromptTokens += data.prompt_eval_count || 0;
      totalCompletionTokens += data.eval_count || 0;

      results.push({ comment: sanitized, draft: cleaned });
    }

    // Track batch usage
    trackLeadEvent({
      route: '/api/ai-comments',
      eventName: 'ai_comment_drafts',
      source: 'server',
      stage: 'submission',
      status: 'success',
      ownerScope: 'legacy',
      provider: MODEL,
      properties: {
        model: MODEL,
        comment_count: comments.length,
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens,
        latency_ms: Date.now() - batchStart,
      },
    }).catch(() => {});

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
