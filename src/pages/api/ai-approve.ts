import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

type ApprovalAction = 'approved' | 'rejected' | 'posted' | 'edited';

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
    const {
      action,
      postSnippet,
      draftText,
      editedText,
      score,
      groupName,
    } = body;

    const validActions: ApprovalAction[] = ['approved', 'rejected', 'posted', 'edited'];
    if (!action || !validActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'Action must be approved, rejected, posted, or edited' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!draftText || typeof draftText !== 'string') {
      return new Response(JSON.stringify({ error: 'draftText required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    trackLeadEvent({
      route: '/api/ai-approve',
      eventName: `ai_scout_${action}`,
      source: 'server',
      stage: action === 'posted' ? 'handoff' : 'submission',
      status: action === 'rejected' ? 'info' : 'success',
      ownerScope: 'legacy',
      provider: 'human',
      properties: {
        action,
        post_snippet: String(postSnippet || '').slice(0, 200),
        draft_text: String(draftText).slice(0, 500),
        edited_text: editedText ? String(editedText).slice(0, 500) : undefined,
        was_edited: !!editedText && editedText !== draftText,
        score: score || null,
        group_name: String(groupName || '').slice(0, 200) || null,
      },
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, action }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
