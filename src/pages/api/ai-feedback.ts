import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { rating, comment, section, page, conversation } = body;

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return new Response(JSON.stringify({ error: 'Rating 1-5 required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sanitise and truncate conversation history if provided
    const sanitisedConversation = Array.isArray(conversation)
      ? conversation.slice(0, 50).map((m: { role?: string; content?: string }) => ({
          role: String(m.role || '').slice(0, 10),
          content: String(m.content || '').slice(0, 2000),
        }))
      : null;

    const feedback = {
      rating,
      comment: String(comment || '').slice(0, 1000),
      section: String(section || 'general').slice(0, 100),
      page: String(page || '/ai-demo').slice(0, 100),
      conversation: sanitisedConversation,
      timestamp: new Date().toISOString(),
    };

    // Try Supabase first
    const supabaseUrl = import.meta.env.SUPABASE_URL?.trim();
    const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (supabaseUrl && serviceRoleKey) {
      const tableName = import.meta.env.SUPABASE_LEAD_ANALYTICS_TABLE?.trim() || 'lead_flow_events';
      await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          event_name: 'ai_demo_feedback',
          source: 'client',
          stage: 'feedback',
          status: rating >= 4 ? 'success' : rating >= 3 ? 'info' : 'warning',
          route: feedback.page,
          properties: feedback,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
