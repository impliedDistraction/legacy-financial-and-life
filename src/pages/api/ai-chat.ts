import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'legacy-messenger';

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
Booking Link: https://calendly.com/bethandtim-legacyf-l/30min
Phone: (706) 333-5641 | Email: Beth@legacyf-l.com

CONVERSATION GOAL:
Every message should move the prospect one step closer to booking a free consultation. You are not a knowledge base — you are a warm, persuasive guide. After answering a question, ALWAYS include a clear next step.

To prompt a booking, place the action block {{book_consultation}} on its own line at the end of your message. This renders a clickable "Book Free Consultation" button — do NOT also write out the booking URL as text. Never include a raw URL and an action block in the same message; the button IS the link.

If the prospect has already been offered booking, vary your approach — ask for their phone number, ask a qualifying question, or use {{collect_info}} instead.

RESPONSE FORMAT:
- 2-3 short paragraphs max. This is a small chat widget.
- Conversational, warm, and honest — not salesy.
- Use the prospect's name if they've shared it.
- Do NOT include raw URLs in your response text. Use action blocks instead.

ACTION BLOCKS:
Embed interactive UI elements by placing an action block on its own line at the end of your message. Available actions:
- {{book_consultation}} — "Book Free Consultation" button. Use when the prospect seems ready or receptive. This IS the booking link — never also type out the URL.
- {{call_now}} — "Call Us Now" button with the office phone. Use when they want to speak to someone immediately.
- {{transfer_agent}} — "Talk to a Real Person" card. Use when the prospect wants a human or has needs beyond your scope.
- {{collect_info}} — Quick contact form (name, phone, state). Use when they've shown interest but haven't provided contact details.
Use at most ONE action block per message. Place it at the end, after your text.

QUALIFYING CHECKLIST:
Weave these questions naturally into the conversation as the prospect engages. Don't ask them all at once — one per message is ideal. Acknowledge answers warmly, don't repeat them back as a checklist.
- Full name
- State of residence (confirm it's a licensed state: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA)
- Age or approximate age range
- Marital / family status (spouse, dependents)
- Current coverage (any existing policies?)
- Primary concern or motivation (why are they looking now?)
- Monthly budget comfort range
- Preferred contact method (phone, email, text)
The goal is a warm conversation that naturally collects everything Tim & Beth need for a productive first call. If the prospect shares info unprompted, count it as checked off.

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
11. EVERY substantive response MUST end with an action block OR a qualifying question. Do not end a message with only information.
12. NEVER include raw URLs (like https://calendly.com/...) in your text. The action blocks render the links as buttons.

/no_think`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
        keep_alive: '2h',
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

    // ── Server-side thinking filter ──────────────────────────────────
    // Qwen3 MoE often emits untagged chain-of-thought reasoning as its
    // initial output ("Okay, the user is asking...", "We need to...",
    // etc.) before producing the customer-facing response.
    //
    // Strategy:
    // 1. Buffer all tokens, accumulating the full output
    // 2. Send heartbeat SSE events during thinking to keep the stream
    //    (and the Vercel function) alive
    // 3. Detect when customer-facing response starts
    // 4. Emit only the clean response tokens to the client
    //
    // The customer-facing response is detected by patterns that match
    // how the model addresses prospects (greetings, warm language, etc.)
    // vs. internal reasoning (meta-commentary about the user/rules).
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const ollamaReader = ollamaRes.body.getReader();
    let promptTokens = 0;
    let completionTokens = 0;

    // Accumulator for the full raw output
    let fullRaw = '';
    // Index into fullRaw where the real response starts (-1 = not found yet)
    let responseStartIdx = -1;
    // How much of the response we've already sent to the client
    let sentUpTo = 0;
    // True once we've detected the response is complete and sent [DONE]
    let responseClosed = false;

    // Patterns that indicate start of customer-facing content.
    // Tested against the accumulated text; the real response often starts
    // after a double newline or at a paragraph beginning.
    const RESPONSE_STARTERS = /(?:^|\n\n)((?:Hi|Hey|Hello|Welcome|Great|Thank|Glad|Absolutely|Sure|Of course|We'd|We would|At Legacy|Legacy Financial|Tim|Beth|I'm Legacy|That's a|I understand|I appreciate|What a|No worries|Good|You're|It sounds|Life insurance|Final expense|Term life|Whole life|Universal|Indexed|Retirement|Estate|An IUL|An annuity|👋|🌟|💙|❤️|🙏|I'd be|I'd love|I'm glad|I'm here|I'm sorry|I completely|That's completely))/im;

    // Pattern that identifies internal reasoning / meta-commentary
    const THINKING_PATTERNS = /^(okay|hmm|so,?\s|well,?\s|let me|the user|i need to|i should|i think|first,?\s|now,?\s|Wait,?\s|alright|this is|we are|checking|I'll |note|According to|We must|We are given|The prospect|Looking at|since |but |However)/i;

    // Detect when the customer-facing response is complete so we can
    // send [DONE] early without waiting for the model to stop generating.
    // Triggers on: action block markers, or common sign-off patterns
    // followed by enough trailing newlines to indicate a paragraph break.
    const ACTION_BLOCK_RE = /\{\{(book_consultation|call_now|transfer_agent|collect_info)\}\}/;
    function isResponseComplete(text: string): boolean {
      // Action blocks are the only reliable completion signal.
      // Sign-off patterns ("Tim & Beth") appear mid-sentence too often
      // to be safe triggers. The client-side 2s idle timeout handles
      // responses that end without an action block.
      return ACTION_BLOCK_RE.test(text);
    }

    function detectResponseStart(): void {
      if (responseStartIdx >= 0) return;
      const trimmed = fullRaw.trimStart();

      // If the output starts with <think>, wait for </think>
      if (trimmed.startsWith('<think>') || trimmed.startsWith('<think')) {
        const closeIdx = fullRaw.indexOf('</think>');
        if (closeIdx >= 0) {
          responseStartIdx = closeIdx + 8; // skip '</think>'
          // Trim leading whitespace from the response
          while (responseStartIdx < fullRaw.length && fullRaw[responseStartIdx] === '\n') {
            responseStartIdx++;
          }
        }
        return;
      }

      // If it starts with a thinking pattern, search for the response boundary
      if (THINKING_PATTERNS.test(trimmed)) {
        const match = fullRaw.match(RESPONSE_STARTERS);
        if (match && match.index !== undefined) {
          // The response starts at the match (after \n\n if present)
          responseStartIdx = match.index;
          if (fullRaw[responseStartIdx] === '\n') {
            // Skip the \n\n separator
            while (responseStartIdx < fullRaw.length && fullRaw[responseStartIdx] === '\n') {
              responseStartIdx++;
            }
          }
        }
        return;
      }

      // Doesn't look like thinking — response starts from the beginning
      responseStartIdx = 0;
    }

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await ollamaReader.read();
          if (done) {
            if (responseClosed) return; // already closed early
            // If we never found a response boundary, send everything
            // (better to show thinking than nothing)
            if (responseStartIdx < 0) responseStartIdx = 0;
            const remaining = fullRaw.slice(Math.max(responseStartIdx, sentUpTo));
            if (remaining) {
              const sseData = JSON.stringify({ content: remaining, done: false });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
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
                fullRaw += raw;
                detectResponseStart();

                if (responseClosed) continue; // already sent [DONE]

                if (responseStartIdx >= 0 && responseStartIdx < fullRaw.length) {
                  // We have response content to send
                  const newContent = fullRaw.slice(Math.max(responseStartIdx, sentUpTo));
                  sentUpTo = fullRaw.length;
                  if (newContent) {
                    const sseData = JSON.stringify({ content: newContent, done: false });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  }

                  // Check if the response looks complete — action block or
                  // sign-off detected. If so, send [DONE] immediately and
                  // let the Ollama stream drain silently.
                  const sentSoFar = fullRaw.slice(responseStartIdx, sentUpTo);
                  if (isResponseComplete(sentSoFar)) {
                    responseClosed = true;
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                    // Fire-and-forget analytics with current counts
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
                } else {
                  // Still in thinking — send a heartbeat to keep stream alive
                  controller.enqueue(encoder.encode(`data: {"heartbeat":true}\n\n`));
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
