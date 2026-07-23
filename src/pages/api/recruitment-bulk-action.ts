import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function recordOperation(campaignId: string, action: string, affectedCount: number, actorEmail: string | undefined, metadata: Record<string, unknown>) {
  // The migration may not yet exist for older client databases. Do not turn a
  // safe operational action into a failed one solely because telemetry is absent.
  await fetch(`${SUPABASE_URL}/rest/v1/recruitment_campaign_operations`, {
    method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' },
    body: JSON.stringify({ campaign_id: campaignId, action, affected_count: affectedCount, actor_email: actorEmail || null, metadata }),
  }).catch(() => undefined);
}

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Database not configured' }, 503);

  try {
    const body = await request.json();
    const action = body.action;
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
    if (!campaignId || !['delete_rejected', 'reset_review_queue'].includes(action)) {
      return json({ error: 'campaignId and a valid bulk action are required' }, 400);
    }

    const campaignRes = await fetch(`${SUPABASE_URL}/rest/v1/recruitment_campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,status&limit=1`, { headers: headers() });
    const [campaign] = campaignRes.ok ? await campaignRes.json() : [];
    if (!campaign) return json({ error: 'Campaign not found' }, 404);
    if (campaign.status !== 'paused') return json({ error: 'Pause the campaign before a bulk cleanup or reset' }, 409);

    const expectedConfirmation = action === 'delete_rejected' ? 'DELETE REJECTED' : 'RESET REVIEW QUEUE';
    if (confirmation !== expectedConfirmation) {
      return json({ error: `Type ${expectedConfirmation} to confirm this paused-campaign action` }, 400);
    }

    const statusFilter = action === 'delete_rejected' ? 'rejected' : 'in.(drafted,reviewed,approved,rejected)';
    const candidatesRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?campaign_id=eq.${encodeURIComponent(campaignId)}&status=${statusFilter}&select=id`, { headers: headers() });
    if (!candidatesRes.ok) throw new Error(`Could not count prospects: ${candidatesRes.status}`);
    const candidates = await candidatesRes.json();
    const affectedCount = candidates.length;

    if (affectedCount > 0) {
      const target = `${SUPABASE_URL}/rest/v1/${TABLE}?campaign_id=eq.${encodeURIComponent(campaignId)}&status=${statusFilter}`;
      const response = action === 'delete_rejected'
        ? await fetch(target, { method: 'DELETE', headers: { ...headers(), Prefer: 'return=minimal' } })
        : await fetch(target, {
          method: 'PATCH', headers: { ...headers(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'pending', processed_at: null, qa_status: null, qa_score: null, qa_checked_at: null,
            qa_rejection_reason: null, email_subject: null, email_body: null, call_opener: null,
            call_voicemail: null, personal_notes: null, fit_score: null, fit_reason: null,
            approved_at: null, updated_at: new Date().toISOString(),
          }),
        });
      if (!response.ok) throw new Error(`${action} failed: ${response.status}`);
    }

    await recordOperation(campaignId, action, affectedCount, session.email, {
      campaign_status: campaign.status,
      confirmation_required: true,
      reset_statuses: action === 'reset_review_queue' ? ['drafted', 'reviewed', 'approved', 'rejected'] : undefined,
    });
    return json({ success: true, action, affectedCount });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Bulk campaign operation failed' }, 500);
  }
};
