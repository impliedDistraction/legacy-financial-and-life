import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

/**
 * GET /api/recruitment-stats
 * Returns aggregate engagement counts for the Sent & Tracking stats bar.
 * Uses a single RPC (recruitment_engagement_stats) that scans the table once
 * instead of 12 parallel count queries.
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

  try {
    const campaignId = new URL(request.url).searchParams.get('campaign_id')?.trim() || '';
    if (campaignId) {
      const [prospectsRes, campaignRes] = await Promise.all([
        fetch(
          `${SUPABASE_URL}/rest/v1/recruitment_prospects?campaign_id=eq.${encodeURIComponent(campaignId)}&select=status,interaction_stage,sent_at,updated_at,properties&limit=1000`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        ),
        fetch(`${SUPABASE_URL}/rest/v1/recruitment_campaigns?id=eq.${encodeURIComponent(campaignId)}&select=status&limit=1`, {
          headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        }),
      ]);
      if (!prospectsRes.ok) throw new Error('Failed to load campaign tracking data');
      const prospects: Array<Record<string, unknown>> = await prospectsRes.json();
      const [campaign] = campaignRes.ok ? await campaignRes.json() : [];
      const sentStatuses = new Set(['sent', 'bounced', 'follow_up_1', 'follow_up_2', 'follow_up_exhausted', 'scheduled', 'converted', 'no_response']);
      const sentProspects = prospects.filter(prospect => sentStatuses.has(String(prospect.status)) && prospect.sent_at);
      const hasProperty = (prospect: Record<string, unknown>, key: string) => {
        const properties = prospect.properties as Record<string, unknown> | null;
        return Boolean(properties?.[key]);
      };
      const count = (predicate: (prospect: Record<string, unknown>) => boolean) => prospects.filter(predicate).length;
      const reactionCount = count(prospect =>
        hasProperty(prospect, 'email_opened_at') || hasProperty(prospect, 'email_clicked_at') ||
        hasProperty(prospect, 'join_page_visited_at') || hasProperty(prospect, 'email_replied_at') ||
        ['interested', 'replied', 'invited_to_call', 'booked'].includes(String(prospect.interaction_stage))
      );
      const sentTimes = sentProspects.map(prospect => String(prospect.sent_at)).sort();
      const stats = {
        sent: sentProspects.length,
        opened: count(prospect => hasProperty(prospect, 'email_opened_at')),
        clicked: count(prospect => hasProperty(prospect, 'email_clicked_at')),
        visited: count(prospect => hasProperty(prospect, 'join_page_visited_at')),
        chatted: count(prospect => hasProperty(prospect, 'chat_session_id') || hasProperty(prospect, 'chat_engaged')),
        interested: count(prospect => prospect.interaction_stage === 'interested'),
        replied: count(prospect => hasProperty(prospect, 'email_replied_at') || prospect.interaction_stage === 'replied'),
        scheduled: count(prospect => prospect.status === 'scheduled'),
        converted: count(prospect => prospect.status === 'converted'),
        bounced: count(prospect => prospect.status === 'bounced'),
        follow_up: count(prospect => ['follow_up_1', 'follow_up_2'].includes(String(prospect.status))),
        no_response: count(prospect => ['follow_up_exhausted', 'no_response'].includes(String(prospect.status))),
        cohort: {
          first_sent_at: sentTimes[0] || null,
          last_sent_at: sentTimes.at(-1) || null,
          awaiting_reaction: Math.max(0, sentProspects.length - reactionCount),
          reaction_count: reactionCount,
          status: campaign?.status || 'unknown',
        },
      };
      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
      });
    }
          const operatingNote = stats.cohort.status === 'paused'
            ? 'This paused cohort is observation-only.'
            : `Campaign status: ${stats.cohort.status}.`;
          cohortSummary.textContent = `Pre-seed cohort: ${stats.sent} delivered · ${stats.cohort.reaction_count} reactions observed · ${stats.cohort.awaiting_reaction} awaiting a signal · first send ${firstSent}. ${operatingNote}`;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/recruitment_engagement_stats`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('recruitment_engagement_stats RPC failed:', res.status, text);
      return new Response(JSON.stringify({ error: 'Failed to load stats' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stats = await res.json();

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Failed to load recruitment stats:', err);
    return new Response(JSON.stringify({ error: 'Failed to load stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
