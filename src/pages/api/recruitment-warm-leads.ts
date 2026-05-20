import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

/**
 * GET /api/recruitment-warm-leads
 * Returns the warmest prospects sorted by engagement depth.
 * Includes chat logs and lead flow events for each.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Fetch all sent/converted prospects that have any engagement beyond just being sent
    // (clicked, visited, opened, replied, chatted, or expressed interest)
    const prospectsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/recruitment_prospects?status=in.(sent,converted,scheduled,follow_up_1,follow_up_2,follow_up_exhausted)&interaction_stage=neq.new&select=id,name,email,phone,state,city,fit_score,fit_reason,status,interaction_stage,sent_at,properties,research_score,web_presence&order=sent_at.desc.nullslast&limit=50`,
      { headers },
    );

    if (!prospectsRes.ok) {
      return Response.json({ error: 'Failed to load prospects' }, { status: 502 });
    }

    const prospects: Record<string, unknown>[] = await prospectsRes.json();
    if (prospects.length === 0) {
      return Response.json({ leads: [], chatLogs: {} });
    }

    // Decay function: warmth decays based on days since last activity.
    // Half-life of ~5 days — after 5 days a signal is worth 50%, after 10 days ~25%, etc.
    const HALF_LIFE_DAYS = 5;
    const now = Date.now();

    function decay(timestamp: unknown): number {
      if (!timestamp) return 0.3; // No timestamp → treat as old (30% weight)
      const ms = new Date(timestamp as string).getTime();
      if (isNaN(ms)) return 0.3;
      const daysSince = (now - ms) / (1000 * 60 * 60 * 24);
      return Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
    }

    // Find the most recent activity timestamp for a prospect
    function lastActivity(props: Record<string, unknown>, p: any): unknown {
      const timestamps = [
        props.email_opened_at, props.email_clicked_at,
        props.join_page_visited_at, props.chat_engaged_at,
        props.email_replied_at, p.sent_at,
      ].filter(Boolean);
      if (timestamps.length === 0) return null;
      return timestamps.reduce((latest, ts) => {
        const d = new Date(ts as string).getTime();
        return d > new Date(latest as string).getTime() ? ts : latest;
      });
    }

    // Score each prospect by engagement depth, decayed over time
    const scored = prospects.map((p: any) => {
      const props = (p.properties || {}) as Record<string, unknown>;
      let warmth = 0;
      const signals: string[] = [];

      // Use most recent activity for decay factor
      const lastTs = lastActivity(props, p);
      const d = decay(lastTs);

      if (props.email_opened_at) { warmth += 1 * d; signals.push('opened'); }
      if (props.email_clicked_at) {
        const isBot = !!props.email_click_bot_detected;
        if (!isBot) { warmth += 2 * d; signals.push('clicked'); }
        else { warmth += 0.5 * d; signals.push('clicked (bot?)'); }
      }
      if (props.join_page_visited_at) { warmth += 3 * d; signals.push('visited /join'); }
      if (props.join_page_visit_count && Number(props.join_page_visit_count) > 1) {
        warmth += 1 * d; signals.push(`${props.join_page_visit_count} visits`);
      }
      if (props.chat_session_id || props.chat_engaged) { warmth += 4 * d; signals.push('chatted with AI'); }
      if (props.text_consent) { warmth += 5 * d; signals.push('gave consent'); }
      if (p.interaction_stage === 'interested') { warmth += 5 * d; signals.push('expressed interest'); }
      if (p.interaction_stage === 'replied') { warmth += 6 * d; signals.push('replied'); }
      if (props.email_replied_at) { warmth += 6 * d; signals.push('email reply'); }
      if (p.status === 'scheduled') { warmth += 8 * d; signals.push('scheduled'); }
      if (p.status === 'converted') { warmth += 10 * d; signals.push('converted'); }

      return { ...p, warmth, signals, lastActivity: lastTs, decayFactor: d };
    });

    // Sort by warmth descending, filter out 0-warmth
    const warm = scored
      .filter((p) => p.warmth > 0)
      .sort((a, b) => b.warmth - a.warmth);

    // Fetch chat logs for warm prospects (batch)
    const warmIds = warm.map((p) => p.id as string);
    const chatLogs: Record<string, unknown[]> = {};

    if (warmIds.length > 0) {
      const chatRes = await fetch(
        `${SUPABASE_URL}/rest/v1/recruitment_chat_logs?prospect_id=in.(${warmIds.map(id => encodeURIComponent(id as string)).join(',')})&select=id,prospect_id,session_id,user_message,assistant_message,created_at,flagged&order=created_at.asc&limit=200`,
        { headers },
      );
      if (chatRes.ok) {
        const logs: Record<string, unknown>[] = await chatRes.json();
        for (const log of logs) {
          const pid = log.prospect_id as string;
          if (!chatLogs[pid]) chatLogs[pid] = [];
          chatLogs[pid].push(log);
        }
      }
    }

    return Response.json({ leads: warm, chatLogs });
  } catch (err) {
    console.error('Warm leads error:', err);
    return Response.json({ error: 'Failed to load warm leads' }, { status: 500 });
  }
};
