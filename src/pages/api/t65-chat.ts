import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * POST /api/t65-chat
 *
 * Medicare guidance chatbot for T65 clients, accessed from their personal dashboard.
 * Uses the t65-medicare-system.md prompt with client context injected.
 * Token-verified (same as t65-dashboard).
 */

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';
const MODEL = import.meta.env.AI_MODEL || 'legacy-messenger';
const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.LEGACY_FINANCIAL_CLIENT_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.LEGACY_FINANCIAL_CLIENT_SUPABASE_SERVICE_ROLE_KEY || '';

// In-memory rate limiter
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 15 * 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// In-memory session store (chat history per token)
const sessions = new Map<string, { messages: Array<{ role: string; content: string }>; lastAccess: number }>();
const MAX_HISTORY = 20;

function getSession(token: string) {
  const session = sessions.get(token);
  if (session) {
    session.lastAccess = Date.now();
    return session;
  }
  const newSession = { messages: [] as Array<{ role: string; content: string }>, lastAccess: Date.now() };
  sessions.set(token, newSession);
  return newSession;
}

// Cleanup stale sessions every 30 min
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of sessions) {
    if (v.lastAccess < cutoff) sessions.delete(k);
  }
}, 30 * 60 * 1000);

export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`t65-chat:${clientIp}`)) {
    return json({ error: 'Too many messages. Please wait a few minutes.' }, 429);
  }

  let body: { token?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const token = String(body.token || '').trim();
  const message = String(body.message || '').trim().slice(0, 2000);

  if (!token || token.length < 10) return json({ error: 'Unauthorized' }, 401);
  if (!message) return json({ error: 'Message required' }, 400);

  // Verify token and fetch client context
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/t65_clients?dashboard_token=eq.${encodeURIComponent(token)}&select=id,first_name,last_name,date_of_birth,state_code,county_name,zip_code,marital_status,employment_status,employer_size,has_employer_coverage,planned_retirement_date,current_coverage_type,prescriptions,medicare_status,status`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!verifyRes.ok) return json({ error: 'Service unavailable' }, 503);
  const clients = await verifyRes.json();
  if (!clients.length) return json({ error: 'Unauthorized' }, 401);

  const client = clients[0];
  const session = getSession(token);

  // Build personalized system prompt with client context
  const systemPrompt = buildSystemPrompt(client);

  // Add user message to history
  session.messages.push({ role: 'user', content: message });
  // Trim to max history
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }

  // Call LLM
  try {
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...session.messages,
    ];

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OLLAMA_SECRET ? { Authorization: `Bearer ${OLLAMA_SECRET}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: llmMessages,
        stream: false,
        options: { temperature: 0.6, top_p: 0.9, num_predict: 512 },
      }),
    });

    if (!ollamaRes.ok) {
      return json({ response: 'I\'m having trouble connecting right now. Please try again in a moment, or call Beth directly at (706) 333-5641.' });
    }

    const data = await ollamaRes.json();
    let response = data.message?.content || '';

    // Strip thinking blocks
    response = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Save assistant response
    session.messages.push({ role: 'assistant', content: response });

    // Log interaction (fire-and-forget)
    fetch(`${SUPABASE_URL}/rest/v1/t65_interactions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        client_id: client.id,
        interaction_type: 'chatbot_session',
        channel: 'web',
        summary: message.slice(0, 200),
        details: { user_message: message, assistant_message: response.slice(0, 1000) },
        initiated_by: 'client',
        agent: 'ai',
      }),
    }).catch(() => {});

    // Check for action blocks and handle them
    const actionMatch = response.match(/\{\{(\w+)\}\}/);
    let actionData: Record<string, string> | undefined;
    if (actionMatch) {
      actionData = { action: actionMatch[1] };
      // Clean action block from displayed response
      response = response.replace(/\{\{[\s\S]*?\}\}/g, '').trim();
    }

    return json({ response, action: actionData });
  } catch {
    return json({ response: 'I\'m having trouble right now. Beth can answer your Medicare questions directly — call (706) 333-5641.' });
  }
};

function buildSystemPrompt(client: Record<string, unknown>): string {
  // Core Medicare knowledge prompt (abbreviated for context window efficiency)
  let prompt = MEDICARE_SYSTEM_PROMPT;

  // Inject client-specific context
  const context: string[] = [];
  if (client.first_name) context.push(`Client name: ${client.first_name} ${client.last_name}`);
  if (client.date_of_birth) {
    const dob = new Date(client.date_of_birth as string);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    context.push(`Age: ${age} (DOB: ${dob.toLocaleDateString('en-US')})`);
    const turn65 = new Date(dob.getFullYear() + 65, dob.getMonth(), dob.getDate());
    const iepStart = new Date(turn65); iepStart.setMonth(iepStart.getMonth() - 3);
    const iepEnd = new Date(turn65); iepEnd.setMonth(iepEnd.getMonth() + 3);
    context.push(`65th birthday: ${turn65.toLocaleDateString('en-US')}`);
    context.push(`IEP window: ${iepStart.toLocaleDateString('en-US')} to ${iepEnd.toLocaleDateString('en-US')}`);
  }
  if (client.state_code) context.push(`Location: ${client.county_name || ''} ${client.state_code} ${client.zip_code || ''}`);
  if (client.marital_status) context.push(`Marital status: ${client.marital_status}`);
  if (client.employment_status) context.push(`Employment: ${client.employment_status}`);
  if (client.employer_size) context.push(`Employer size: ${client.employer_size} employees`);
  if (client.has_employer_coverage) context.push(`Has current employer coverage: Yes`);
  if (client.planned_retirement_date) context.push(`Planned retirement: ${new Date(client.planned_retirement_date as string).toLocaleDateString('en-US')}`);
  if (client.current_coverage_type) context.push(`Current coverage: ${client.current_coverage_type}`);
  if (client.medicare_status) context.push(`Medicare status: ${client.medicare_status}`);
  const meds = client.prescriptions as Array<{ name: string }> | undefined;
  if (meds?.length) context.push(`Medications: ${meds.map(m => m.name).join(', ')}`);

  if (context.length) {
    prompt += `\n\n## This Client's Situation\n${context.join('\n')}\n\nUse this information to personalize your guidance. Do NOT repeat all this back to the client — they already know their own situation. Reference it naturally when relevant.`;
  }

  prompt += '\n\n/no_think';
  return prompt;
}

// Condensed system prompt (full version is in ai/prompts/t65-medicare-system.md)
const MEDICARE_SYSTEM_PROMPT = `You are a Medicare transition specialist AI for Legacy Financial & Life. Beth Byrd is the Medicare enrollment expert.

## Your Role
Guide people approaching age 65 through Medicare transition. Answer questions about timing, parts, enrollment periods, and coverage decisions — personalized to their situation.

## Core Medicare Knowledge

### Parts of Medicare
- Part A (Hospital): FREE for most (40+ work quarters). Inpatient, skilled nursing, hospice.
- Part B (Medical): $185/mo (2026). Doctor visits, outpatient, preventive. IRMAA surcharges for income >$103K.
- Part C (Medicare Advantage): Private plans bundling A+B+usually D. Network-restricted. Often $0 premium.
- Part D (Prescription Drugs): Standalone or included in Part C. Each plan has its own formulary.
- Medigap (Supplement): Covers cost-sharing gaps in Original Medicare. Standardized letter plans. Plan G most popular for new enrollees.

### Critical Enrollment Periods
- IEP (Initial Enrollment Period): 7-month window around 65th birthday (3 before + birthday month + 3 after)
- Part B late penalty: 10% per year delayed — PERMANENT
- Part D late penalty: 1% × base premium × months without creditable coverage — PERMANENT
- Working past 65 with employer (20+ employees): Can delay Part B without penalty. 8-month SEP when employment ends.
- Working past 65 with employer (<20 employees): Medicare becomes PRIMARY at 65. Must enroll on time.
- AEP (Annual Enrollment): Oct 15–Dec 7. Change MA/Part D plans.
- Medigap Open Enrollment: 6 months starting month you're 65+ AND have Part B. Guaranteed issue. ONE-TIME WINDOW.

### COBRA Warning
COBRA does NOT count as creditable coverage. Cannot delay Medicare penalty-free with COBRA. If 65+ and choosing COBRA over Medicare: penalties accrue.

### Key Decision: Original Medicare + Medigap vs. Medicare Advantage
- Original + Medigap: Nationwide provider access, predictable costs, higher monthly premium, separate Part D
- Medicare Advantage: Network-restricted, often $0 premium, MOOP $5K-$8.3K/year, may include dental/vision/hearing

### State Rules
- GA, FL, TX: Standard federal rules (6-month Medigap OE only, underwriting after)
- Guaranteed Issue states: CT, MA, ME, MN, NY, VT, WA
- Birthday rule states: CA, IL, LA, MO, OR

## Response Style
- Clear, 2-4 paragraphs max
- Explain jargon when used
- Always end with a next step (question, offer to explain, or booking CTA)
- Use urgency appropriately for deadlines and penalties
- Never guarantee outcomes — Beth reviews and finalizes all decisions

## Action Blocks (include max ONE per response, on its own line)
{{collect_medicare_info}} — When client provides key intake data
{{book_medicare_review}} — When ready to schedule with Beth
{{escalate_to_beth}} — Complex situation needing licensed expertise

## Contact
- Phone: (706) 333-5641
- Booking: https://calendly.com/bethandtim-legacyf-l/30min
- AI disclosure: "I'm Legacy Financial's Medicare guidance assistant. Beth Byrd personally handles all enrollment decisions."`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
