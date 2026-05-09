import type { APIRoute } from 'astro';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'legacy-messenger';

const SYSTEM_PROMPT = `You are the recruitment assistant for Legacy Financial & Life, an insurance agency in Luthersville, Georgia founded by Tim and Beth Byrd.

You help licensed insurance agents who are considering joining the Legacy Financial team. You answer questions about the opportunity, the team culture, compensation structure (in general terms), and what makes Legacy Financial different.

About Legacy Financial & Life:
- Tim and Beth Byrd — sold 300+ life insurance policies in two years
- Licensed in: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac, National Life Group, North American
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities
- Offers direct mentorship, weekly training, AI-powered tools, lead sharing, proven systems
- In-house AI tools to help agents with prospecting and client communication

CONVERSATION GOAL:
Help the prospect understand the opportunity and encourage them to fill out the interest form on this page or schedule a call with the team. Be warm, honest, and informative.

RESPONSE FORMAT:
- 2-3 short paragraphs max. This is a chat widget, not an essay.
- Be conversational and encouraging, not salesy.
- If they have specific questions you can't answer, encourage them to fill out the form so Beth can follow up.

ACTION BLOCKS:
You can embed interactive UI elements using action blocks. Place each on its own line at the end of your message. Available:
- {{book_call}} — Renders a "Schedule a Call" button. Use when prospect is ready to talk.
- {{fill_form}} — Renders a "Fill Out Interest Form" nudge. Use to guide them to the form on this page.
Use at most ONE action block per message.

STRICT RULES:
1. NEVER quote specific commission rates, income amounts, or dollar figures
2. NEVER guarantee income or make earning promises
3. NEVER use MLM language (passive income, unlimited earning, be your own boss, financial freedom)
4. NEVER disparage other agencies
5. If asked if you are AI, be honest: "I'm an AI assistant for Legacy Financial's recruiting team. Beth handles all the personal conversations — I'm here to answer your initial questions."
6. Keep responses focused on the recruitment opportunity
7. Be warm, professional, concise
8. NEVER output internal reasoning or chain-of-thought

/no_think`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Simple in-memory rate limiter (per IP, resets on deploy)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // messages per window
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: 'Too many messages. Please try again shortly.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Limit conversation length to prevent abuse
    const trimmedMessages = messages.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: String(m.content).slice(0, 1000),
    }));

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmedMessages,
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
          num_predict: 400,
        },
      }),
    });

    if (!ollamaRes.ok || !ollamaRes.body) {
      return new Response(JSON.stringify({ error: 'AI assistant unavailable right now' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream response with thinking filter (same approach as ai-chat.ts)
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const ollamaReader = ollamaRes.body.getReader();

    let fullRaw = '';
    let responseStartIdx = -1;
    let sentUpTo = 0;
    let responseClosed = false;

    const THINKING_PATTERNS = /^(okay|hmm|so,?\s|well,?\s|let me|the user|i need to|i should|i think|first,?\s|now,?\s|Wait,?\s|alright|this is|we are|checking|I'll |note|According to|We must|We are given|The prospect|Looking at|since |but |However)/i;
    const RESPONSE_STARTERS = /(?:^|\n\n)((?:Hi|Hey|Hello|Welcome|Great|Thank|Glad|Absolutely|Sure|Of course|We'd|We would|At Legacy|Legacy Financial|Tim|Beth|I'm |That's a|I understand|I appreciate|What a|No worries|Good|You're|It sounds|The team|Our team|👋|🌟|💙))/im;
    const ACTION_BLOCK_RE = /\{\{(book_call|fill_form)\}\}/;

    function detectResponseStart() {
      if (responseStartIdx >= 0) return;
      const trimmed = fullRaw.trimStart();
      if (trimmed.startsWith('<think>') || trimmed.startsWith('<think')) {
        const closeIdx = fullRaw.indexOf('</think>');
        if (closeIdx >= 0) {
          responseStartIdx = closeIdx + 8;
          while (responseStartIdx < fullRaw.length && fullRaw[responseStartIdx] === '\n') responseStartIdx++;
        }
        return;
      }
      if (THINKING_PATTERNS.test(trimmed)) {
        const match = fullRaw.match(RESPONSE_STARTERS);
        if (match && match.index !== undefined) {
          responseStartIdx = match.index;
          if (fullRaw[responseStartIdx] === '\n') responseStartIdx += 2;
        }
      } else {
        responseStartIdx = 0;
      }
    }

    const stream = new ReadableStream({
      async pull(controller) {
        if (responseClosed) { controller.close(); return; }
        try {
          const { done, value } = await ollamaReader.read();
          if (done) {
            detectResponseStart();
            if (responseStartIdx >= 0 && sentUpTo < fullRaw.length) {
              const remaining = fullRaw.slice(Math.max(responseStartIdx, sentUpTo));
              if (remaining) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: remaining })}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) fullRaw += json.message.content;
              if (json.done) {
                detectResponseStart();
                if (responseStartIdx >= 0 && sentUpTo < fullRaw.length) {
                  const remaining = fullRaw.slice(Math.max(responseStartIdx, sentUpTo));
                  if (remaining) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: remaining })}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                responseClosed = true;
                controller.close();
                return;
              }
            } catch { /* skip malformed lines */ }
          }

          detectResponseStart();
          if (responseStartIdx >= 0) {
            const newContent = fullRaw.slice(Math.max(responseStartIdx, sentUpTo));
            if (newContent) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: newContent })}\n\n`));
              sentUpTo = fullRaw.length;
            }
          } else {
            // Send heartbeat while thinking
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          }
        } catch {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
