import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const prerender = false;

/**
 * GET /api/voice-gather-insights?node_id=<id>&tree_id=<uuid>
 *
 * Returns escape path analytics and unhandled pattern suggestions
 * for a specific llm_gather node.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const nodeId = url.searchParams.get('node_id');
  const treeId = url.searchParams.get('tree_id');

  if (!nodeId) {
    return new Response(JSON.stringify({ error: 'node_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ paths: [], unhandled: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch gather sessions for this node (last 30 days, max 100)
    let sessionsFilter = `node_id=eq.${encodeURIComponent(nodeId)}&order=created_at.desc&limit=100`;
    if (treeId) sessionsFilter += `&tree_id=eq.${treeId}`;
    
    const sessionsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/gather_sessions?${sessionsFilter}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );

    // Fetch insights for this node
    let insightsFilter = `node_id=eq.${encodeURIComponent(nodeId)}&status=eq.pending&order=occurrence_count.desc&limit=20`;
    if (treeId) insightsFilter += `&tree_id=eq.${treeId}`;

    const insightsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/gather_insights?${insightsFilter}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );

    const sessions = sessionsRes.ok ? await sessionsRes.json() : [];
    const insights = insightsRes.ok ? await insightsRes.json() : [];

    // Aggregate sessions into paths
    const pathCounts: Record<string, { count: number; slots_filled: string[]; samples: string[] }> = {};
    for (const s of sessions) {
      const key = `${s.outcome}:${s.return_node || 'none'}`;
      if (!pathCounts[key]) pathCounts[key] = { count: 0, slots_filled: [], samples: [] };
      pathCounts[key].count++;
      if (s.slots_extracted) {
        const filled = Object.keys(s.slots_extracted).filter(k => s.slots_extracted[k]);
        pathCounts[key].slots_filled.push(...filled);
      }
      if (s.turns?.length > 0 && pathCounts[key].samples.length < 3) {
        const lastUserTurn = [...s.turns].reverse().find((t: any) => t.role === 'user');
        if (lastUserTurn) pathCounts[key].samples.push(lastUserTurn.text || lastUserTurn.content || '');
      }
    }

    // Format paths for UI
    const paths = Object.entries(pathCounts).map(([key, val]) => {
      const [outcome, returnNode] = key.split(':');
      const slotSet = [...new Set(val.slots_filled)];
      const label = outcome === 'returned' 
        ? `Returned to "${returnNode}"` 
        : outcome === 'max_turns' 
        ? 'Max turns hit → forced return' 
        : outcome === 'hangup' 
        ? 'Caller hung up during gather' 
        : outcome;
      return {
        outcome,
        label,
        count: val.count,
        slots_filled: slotSet.length > 0 ? slotSet.join(', ') : '',
        sample: val.samples[0] || '',
      };
    }).sort((a, b) => b.count - a.count);

    // Format unhandled patterns from insights
    const unhandled = insights
      .filter((i: any) => i.insight_type === 'unhandled_pattern')
      .map((i: any) => ({
        pattern: i.pattern,
        count: i.occurrence_count,
        examples: i.examples || [],
      }));

    return new Response(JSON.stringify({ paths, unhandled, total_sessions: sessions.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
