import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

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

CONVERSATION GOAL:
Every message should move the prospect one step closer to booking a free consultation. You are not a knowledge base — you are a warm, persuasive guide. After answering a question, ALWAYS include a clear next step or call-to-action. Examples:
- "Would you like to book a quick, no-obligation call with Tim & Beth to explore your options? Here's the link: https://app.ringy.com/book/legacy"
- "I'd love to have Tim or Beth walk you through the details — can I get your name and phone number so they can reach out?"
- "Want me to set up a free consultation for you? It only takes a couple minutes: https://app.ringy.com/book/legacy"

If the prospect has already been given the booking link, vary your CTA — try asking for their phone number or email instead, or ask a qualifying question (age, state, family situation) to demonstrate personal attention.

RESPONSE FORMAT:
- Keep it to 2-4 short paragraphs max. This is Messenger, not an essay.
- Lead with empathy or a direct answer, then pivot to a CTA.
- Use the prospect's name if they've shared it.

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
10. NEVER output internal reasoning, chain-of-thought, or meta-commentary. Never say "Okay, the user is asking..." or "Let me think about this". Respond DIRECTLY to the customer.
11. EVERY substantive response MUST contain a specific call-to-action (booking link, ask for contact info, or qualifying question). Do not end a message with only information — always guide the user toward the next step.`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── Think-stripping state machine ─────────────────────────────────
// Primary defense: strip <think>…</think> blocks server-side so they
// never reach the client. The client retains its heuristic filter as
// a secondary safety net for any untagged thinking that slips through.
const enum ThinkState { OUTSIDE, INSIDE }

function createThinkStripper() {
  let state: ThinkState = ThinkState.OUTSIDE;
  let buffer = '';

  return function strip(chunk: string): string {
    let output = '';
    buffer += chunk;

    while (buffer.length > 0) {
      if (state === ThinkState.OUTSIDE) {
        const openIdx = buffer.indexOf('<think>');
        if (openIdx === -1) {
          // No opening tag — check if buffer ends with a partial '<think'
          // Keep last 6 chars in case of partial tag
          const safe = buffer.length > 6 ? buffer.slice(0, -6) : '';
          output += safe;
          buffer = buffer.slice(safe.length);
          break;
        } else {
          output += buffer.slice(0, openIdx);
          buffer = buffer.slice(openIdx + 7); // skip '<think>'
          state = ThinkState.INSIDE;
        }
      } else {
        const closeIdx = buffer.indexOf('</think>');
        if (closeIdx === -1) {
          // Still inside thinking — discard everything, keep partial tag
          buffer = buffer.length > 8 ? buffer.slice(-8) : buffer;
          break;
        } else {
          buffer = buffer.slice(closeIdx + 8); // skip '</think>'
          state = ThinkState.OUTSIDE;
        }
      }
    }

    return output;
  };
}

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: String(m.content).slice(0, 2000),
      })),
    ];

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

    // Pipe Ollama NDJSON → SSE with server-side <think> stripping.
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const ollamaReader = ollamaRes.body.getReader();
    const stripThinking = createThinkStripper();
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await ollamaReader.read();
          if (done) {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();

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
              },
            }).catch(() => {});
            return;
          }

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter(Boolean);

          for (const line of lines) {
            try {
              const chunk = JSON.parse(line);

              if (chunk.done) {
                promptTokens = chunk.prompt_eval_count || 0;
                completionTokens = chunk.eval_count || 0;
              }

              const raw: string = chunk.message?.content || '';
              if (raw) {
                const content = stripThinking(raw);
                if (content) {
                  const sseData = JSON.stringify({ content, done: false });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                }
              }
            } catch { /* skip malformed lines */ }
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
