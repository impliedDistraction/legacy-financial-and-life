import type { APIRoute } from 'astro';

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

function stripThinking(text: string): string {
  // Qwen3 models emit thinking in <think>...</think> tags
  const thinkEnd = text.indexOf('</think>');
  if (thinkEnd !== -1) {
    return text.substring(thinkEnd + 8).trimStart();
  }
  return text;
}

function stripUntaggedThinking(text: string): string {
  // Qwen3 MoE sometimes outputs untagged chain-of-thought before the actual
  // response. Detect and strip it by looking for the transition point.
  // Thinking lines typically start with "Okay," "Hmm," "The user," "I need to,"
  // "Let me," "So," etc. and read as internal monologue.
  const thinkingPrefixes = /^(okay|hmm|so|well|let me|the user|i need|i should|i think|first|now|alright|right)/i;
  const lines = text.split('\n');

  // If the first line doesn't look like thinking, return as-is
  if (!thinkingPrefixes.test(lines[0].trim())) return text;

  // Find where thinking ends and the actual customer-facing response starts.
  // Look for a blank line gap followed by content that addresses the customer,
  // or a greeting/response pattern.
  const responseStart = /^(hi|hey|hello|welcome|great|thank|glad|absolutely|sure|of course|we |at legacy|legacy financial|tim|beth|👋|🌟|💙|i'd)/i;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Check if this line starts the actual response
    if (i > 0 && responseStart.test(trimmed)) {
      return lines.slice(i).join('\n').trimStart();
    }
    // A double newline gap followed by non-thinking content
    if (trimmed === '' && i + 1 < lines.length && responseStart.test(lines[i + 1].trim())) {
      return lines.slice(i + 1).join('\n').trimStart();
    }
  }

  // If we can't find a clear transition, return the full text 
  // (better to show thinking than nothing)
  return text;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prepend system prompt
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: String(m.content).slice(0, 2000),
      })),
    ];

    // Collect full response from Ollama first (non-streaming), then strip
    // thinking content and re-stream to client. Qwen3 MoE models leak
    // chain-of-thought without <think> tags, so we can't filter in-stream.
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
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2048,
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
    let fullText: string = ollamaData.message?.content || '';

    // Strip <think>...</think> blocks if present
    fullText = stripThinking(fullText);

    // Strip untagged chain-of-thought that Qwen3 outputs before the actual
    // response. Pattern: starts with meta-commentary like "Okay, the user..."
    // and transitions to the actual customer-facing response after a double
    // newline or when the tone shifts to addressing the customer directly.
    fullText = stripUntaggedThinking(fullText);

    // Re-stream the cleaned text as SSE word-chunks for a typing effect
    const encoder = new TextEncoder();
    const CHUNK_SIZE = 4; // words per SSE chunk
    const words = fullText.split(/(\s+)/); // preserve whitespace

    const stream = new ReadableStream({
      start(controller) {
        // Write all chunks immediately — SSE transport handles the streaming
        for (let i = 0; i < words.length; i += CHUNK_SIZE) {
          const chunk = words.slice(i, i + CHUNK_SIZE).join('');
          if (chunk) {
            const sseData = JSON.stringify({ content: chunk, done: false });
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
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
