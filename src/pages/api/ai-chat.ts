import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'qwen3:30b';

const SYSTEM_PROMPT = `You are a helpful assistant for Legacy Financial & Life, an insurance agency founded by Tim and Beth Byrd in Luthersville, Georgia.

You are the first point of contact for prospects who message Legacy Financial & Life on Facebook. You answer questions about insurance products, qualify leads, and guide interested prospects toward booking a free consultation.

About Legacy Financial & Life:
- Founded and operated by Tim and Beth Byrd, Luthersville, Georgia
- Over 15 years combined experience across private, nonprofit, and government sectors
- Managed more than $75M in HUD assets, sold 300+ life insurance policies in two years
- Active community volunteers with 20+ years of church and community service
- Advanced degrees in human services and behavioral science

Products & Services:
- Term Life Insurance: Affordable coverage for a set period
- Whole Life Insurance: Lifelong coverage with guaranteed cash value growth
- Universal Life Insurance: Flexible premiums and death benefits
- Final Expense / Burial Insurance: Covers funeral and end-of-life costs
- Indexed Universal Life (IUL): Market-linked growth with downside protection
- Fixed & Indexed Annuities: Guaranteed or market-linked growth with principal protection
- Retirement Income Planning and Estate Planning Strategies

Licensed States: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
Carriers: Mutual of Omaha, Transamerica, Aflac, and other trusted carriers
Booking Link: https://app.ringy.com/book/legacy
Phone: (706) 333-5641 | Email: Beth@legacyf-l.com

STRICT RULES:
1. NEVER quote specific premiums, rates, or dollar amounts
2. NEVER provide specific financial, tax, or legal advice
3. NEVER disparage competitors
4. If asked if you are AI, disclose honestly: "I'm Legacy Financial's AI assistant helping with initial questions — Tim and Beth will personally handle your consultation."
5. Escalate complex questions to Tim and Beth
6. Stay on topic (insurance and financial planning)
7. Be warm, professional, concise
8. Sign messages as "Tim & Beth" or "The Legacy Financial Team"
9. Comply with insurance advertising regulations — no guaranteed returns or misleading claims
10. NEVER output internal reasoning, chain-of-thought, or meta-commentary. Never say "Okay, the user is asking..." or "Let me think about this". Respond DIRECTLY to the customer.`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Strip <think>...</think> blocks as a safety net — thinking should be disabled
// via /no_think but models occasionally ignore the hint.
function stripThinking(text: string): string {
  const thinkEnd = text.indexOf('</think>');
  if (thinkEnd !== -1) return text.substring(thinkEnd + 8).trimStart();
  // Also strip an opening <think> tag with no matching close (partial thinking)
  const thinkStart = text.indexOf('<think>');
  if (thinkStart === 0) {
    // Everything is inside a think block with no close — wait or return empty
    return '';
  }
  return text;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const requestStart = Date.now();
    const body = await request.json();
    const messages: ChatMessage[] = body.messages;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prepend system prompt. The /no_think directive disables Qwen3's
    // chain-of-thought so we get faster, direct responses we can stream.
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: String(m.content).slice(0, 2000),
      })),
    ];

    // Append /no_think to the last user message to disable chain-of-thought
    const lastMsg = fullMessages[fullMessages.length - 1];
    if (lastMsg.role === 'user') {
      lastMsg.content += ' /no_think';
    }

    const ollamaHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    };
    if (OLLAMA_SECRET) ollamaHeaders['Authorization'] = `Bearer ${OLLAMA_SECRET}`;

    // True streaming from Ollama → client. With thinking disabled we can
    // pipe tokens directly instead of buffering the full response.
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: ollamaHeaders,
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        stream: true,
        keep_alive: '30m',
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 512,
        },
      }),
    });

    if (!ollamaRes.ok || !ollamaRes.body) {
      return new Response(JSON.stringify({ error: 'AI model unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream Ollama's NDJSON → SSE for the client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const ollamaReader = ollamaRes.body.getReader();
    let fullText = '';
    let insideThink = false;
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await ollamaReader.read();
          if (done) {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();

            // Track usage after stream completes
            trackLeadEvent({
              route: '/api/ai-chat',
              eventName: 'ai_chat_completion',
              source: 'server',
              stage: 'submission',
              status: 'success',
              ownerScope: 'legacy',
              provider: MODEL,
              properties: {
                model: MODEL,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: promptTokens + completionTokens,
                latency_ms: Date.now() - requestStart,
                message_count: messages.length,
                streaming: true,
              },
            }).catch(() => {});
            return;
          }

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter(Boolean);

          for (const line of lines) {
            try {
              const chunk = JSON.parse(line);
              const content: string = chunk.message?.content || '';

              // Capture token counts from the final chunk
              if (chunk.done) {
                promptTokens = chunk.prompt_eval_count || 0;
                completionTokens = chunk.eval_count || 0;
              }

              if (!content) continue;

              // Safety-net: skip <think>...</think> blocks if model ignores /no_think
              if (content.includes('<think>')) { insideThink = true; continue; }
              if (insideThink) {
                if (content.includes('</think>')) {
                  insideThink = false;
                  const after = content.split('</think>').pop()?.trim();
                  if (after) {
                    fullText += after;
                    const sseData = JSON.stringify({ content: after, done: false });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  }
                }
                continue;
              }

              fullText += content;
              const sseData = JSON.stringify({ content, done: false });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            } catch { /* skip malformed NDJSON lines */ }
          }
        } catch {
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
