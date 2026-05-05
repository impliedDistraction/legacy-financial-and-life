import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RESEND_API_KEY = import.meta.env.RESEND_API_KEY?.trim();
const TABLE = 'recruitment_prospects';

/**
 * POST /api/recruitment-action
 * Execute an action on a prospect: approve, reject, send email, mark called.
 * Body: { id, action, editedEmailBody?, callOutcome? }
 */
export const POST: APIRoute = async ({ request }) => {
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
    const body = await request.json();
    const { id, action, editedEmailBody, callOutcome } = body;

    if (!id || !action) {
      return new Response(JSON.stringify({ error: 'id and action required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch the prospect
    const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&limit=1`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const [prospect] = await fetchRes.json();
    if (!prospect) {
      return new Response(JSON.stringify({ error: 'Prospect not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    switch (action) {
      case 'approve':
        update.status = 'approved';
        update.approved_at = new Date().toISOString();
        update.approved_by = session.email;
        if (editedEmailBody) update.edited_email_body = String(editedEmailBody).slice(0, 5000);
        break;

      case 'reject':
        update.status = 'rejected';
        break;

      case 'send_email':
        if (!prospect.email) {
          return new Response(JSON.stringify({ error: 'Prospect has no email address' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Block sends to test domain
        if (String(prospect.email).endsWith('@test.legacy')) {
          return new Response(JSON.stringify({ error: 'Cannot send to test domain (@test.legacy)' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!RESEND_API_KEY) {
          return new Response(JSON.stringify({ error: 'Email service not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const emailBody = prospect.edited_email_body || editedEmailBody || prospect.email_body;
        const emailSubject = prospect.email_subject;
        if (!emailBody || !emailSubject) {
          return new Response(JSON.stringify({ error: 'No email content generated yet' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Send via Resend
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Tim Byrd <tim@legacyf-l.com>',
            to: [prospect.email],
            subject: emailSubject,
            text: emailBody,
            reply_to: 'tim@legacyf-l.com',
          }),
        });

        if (!sendRes.ok) {
          const err = await sendRes.text().catch(() => '');
          console.error('Resend recruitment email failed:', sendRes.status, err);
          return new Response(JSON.stringify({ error: 'Email send failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        update.status = 'sent';
        update.email_sent_at = new Date().toISOString();
        break;

      case 'mark_called':
        update.call_made_at = new Date().toISOString();
        update.call_outcome = String(callOutcome || 'no_answer').slice(0, 50);
        if (callOutcome === 'scheduled' || callOutcome === 'spoke') {
          update.status = 'converted';
        }
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    // Apply update
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(update),
    });

    if (!updateRes.ok) {
      return new Response(JSON.stringify({ error: 'Database update failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, action, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Recruitment action error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
