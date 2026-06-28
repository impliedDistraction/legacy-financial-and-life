import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SENTINEL_URL = import.meta.env.OLLAMA_URL?.trim()?.replace(/\/+$/, '') || 'http://localhost:3377';

/**
 * POST /api/voice-ai-generate — Generate speak text for a dialog tree node using AI
 *
 * Body: { nodeId, edges, slots, category, treeName, nodeAction, prevContext, existingSpeak? }
 * Returns: { speak: string[] }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { nodeId, edges, slots, category, treeName, nodeAction, prevContext, existingSpeak } = body;
  if (!nodeId) {
    return new Response(JSON.stringify({ error: 'nodeId required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build the prompt
  const categoryDesc: Record<string, string> = {
    sales: 'outbound sales qualifying call for life insurance',
    recruitment: 'outbound recruitment call for insurance agents',
    inbound: 'inbound call reception and routing',
    client_outreach: 'outbound call to existing insurance clients',
    custom: 'general phone conversation',
  };

  const edgeList = (edges || []).filter((e: string) => !e.startsWith('_')).join(', ');
  const slotList = (slots || []).join(', ');

  let prompt = `You are writing dialog scripts for an AI phone agent. The call is a ${categoryDesc[category] || 'phone conversation'}.`;
  prompt += `\n\nGenerate 2-3 natural spoken variants for the "${nodeId}" node in this call flow.`;
  if (treeName) prompt += ` The script is called "${treeName}".`;
  if (prevContext) prompt += `\n\nThe previous step said: "${prevContext}"`;
  if (edgeList) prompt += `\n\nExpected caller responses to this node: ${edgeList}`;
  if (slotList) prompt += `\nSlots being collected in this call: ${slotList}`;
  if (nodeAction) prompt += `\nThis node's action: ${nodeAction}`;
  if (existingSpeak) prompt += `\n\nCurrent text (improve these): ${existingSpeak}`;

  prompt += `\n\nRequirements:
- Each variant should be concise (1-2 sentences max for phone)
- Sound natural and conversational, not robotic
- If this is a question node, ask one clear question
- Use {slotName} syntax for dynamic values (e.g., {firstName}, {age})
- For sales: be transparent, professional, not pushy
- Variants should differ in wording but ask the same thing

Return ONLY the variants, one per line. No numbering, no quotes, no explanation.`;

  try {
    const res = await fetch(`${SENTINEL_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentinel-Client': 'research',
      },
      body: JSON.stringify({
        model: 'legacy-messenger',
        stream: false,
        messages: [
          { role: 'system', content: 'You generate concise phone script dialog variants. Output only the spoken lines, one per line.' },
          { role: 'user', content: prompt },
        ],
        options: { temperature: 0.8, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'AI backend error', status: res.status }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const content = data.message?.content || data.response || '';

    // Parse response: split by newlines, clean up
    const lines = content.split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && l.length < 200)
      .map((l: string) => l.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '').trim())
      .filter((l: string) => l.length > 5);

    if (lines.length === 0) {
      return new Response(JSON.stringify({ error: 'AI returned empty output' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ speak: lines.slice(0, 4) }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'AI generation failed', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
