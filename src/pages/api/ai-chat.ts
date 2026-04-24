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

// Strip <think>...</think> blocks from a completed string (used as fallback).
function stripThinking(text: string): string {
  const thinkEnd = text.indexOf('</think>');
  if (thinkEnd !== -1) return text.substring(thinkEnd + 8).trimStart();
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

    // Stream Ollama → SSE, buffering and hiding <think>...</think> blocks.
    // Qwen3 often emits a <think> block at the start. We accumulate all
    // content while inside a think block and only start sending SSE events
    // once we're past it. This gives us true streaming for the real response
    // while hiding internal reasoning.
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const ollamaReader = ollamaRes.body.getReader();
    let rawBuffer = '';         // accumulates raw text to detect think boundaries
    let insideThink = false;
    let thinkingDone = false;   // once true, stream everything directly
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await ollamaReader.read();
          if (done) {
            // If we never exited thinking, try to salvage a response
            if (insideThink && rawBuffer.includes('</think>')) {
              const cleaned = stripThinking(rawBuffer);
              if (cleaned) {
                const sseData = JSON.stringify({ content: cleaned, done: false });
                controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
              }
            }

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

              if (chunk.done) {
                promptTokens = chunk.prompt_eval_count || 0;
                completionTokens = chunk.eval_count || 0;
              }

              if (!content) continue;

              // If we already finished thinking, stream directly
              if (thinkingDone) {
                const sseData = JSON.stringify({ content, done: false });
                controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                continue;
              }

              // Accumulate into buffer to detect think block boundaries
              rawBuffer += content;

              // Detect opening <think> tag
              if (!insideThink && rawBuffer.includes('<think>')) {
                // Send a status event so client knows model is thinking
                const beforeThink = rawBuffer.split('<think>')[0];
                if (beforeThink.trim()) {
                  const sseData = JSON.stringify({ content: beforeThink, done: false });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                }
                insideThink = true;
              }

              // Detect closing </think> tag
              if (insideThink && rawBuffer.includes('</think>')) {
                const afterThink = rawBuffer.split('</think>').pop()?.trimStart() || '';
                insideThink = false;
                thinkingDone = true;
                rawBuffer = ''; // free memory

                if (afterThink) {
                  const sseData = JSON.stringify({ content: afterThink, done: false });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                }
                continue;
              }

              // Not inside thinking and no think tag seen — stream directly
              if (!insideThink && !rawBuffer.includes('<think')) {
                // Check if buffer might contain a partial "<think" tag
                // If the buffer ends with "<" or "<t" etc, hold it
                const partialTag = rawBuffer.match(/<t?h?i?n?k?>?$/);
                if (partialTag) {
                  // Hold the partial tag, send everything before it
                  const safe = rawBuffer.slice(0, rawBuffer.length - partialTag[0].length);
                  if (safe) {
                    const sseData = JSON.stringify({ content: safe, done: false });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                    rawBuffer = partialTag[0];
                  }
                } else {
                  const sseData = JSON.stringify({ content: rawBuffer, done: false });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  rawBuffer = '';
                }
              }
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
