import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RESEND_API_KEY = import.meta.env.RESEND_API_KEY?.trim();
const TABLE = 'recruitment_prospects';

// ── Send lock: set to false once client approves email content ──
const RECRUITMENT_SENDS_ENABLED = import.meta.env.RECRUITMENT_SENDS_ENABLED === 'true';

/**
 * POST /api/recruitment-action
 * Execute an action on a prospect: approve, reject, send email, mark called, delete.
 * Body: { id, action, editedEmailBody?, callOutcome?, reason? }
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
    const { id, action, editedEmailBody, callOutcome, reason } = body;

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

    let update: Record<string, unknown> = {};

    switch (action) {
      case 'approve':
        update.status = 'approved';
        update.approved_at = new Date().toISOString();
        break;

      case 'reject':
        update.status = 'rejected';
        // Store rejection reason in properties JSONB (column may not exist yet)
        update.properties = { ...(prospect.properties || {}), rejection_reason: reason || null };
        break;

      case 'delete': {
        // Permanently remove the record
        const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        if (!deleteRes.ok) {
          return new Response(JSON.stringify({ error: 'Delete failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, action: 'delete', id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'send_email':
        if (!RECRUITMENT_SENDS_ENABLED) {
          return new Response(JSON.stringify({ error: 'Recruitment email sending is locked — client review in progress. Set RECRUITMENT_SENDS_ENABLED=true to unlock.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
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

        const emailBody = editedEmailBody || prospect.email_body;
        const emailSubject = prospect.email_subject;
        if (!emailBody || !emailSubject) {
          return new Response(JSON.stringify({ error: 'No email content generated yet' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Look up campaign reply-to if prospect has a campaign
        let replyTo = 'recruiting@legacyfinancial.app';
        if (prospect.campaign_id) {
          try {
            const campRes = await fetch(
              `${SUPABASE_URL}/rest/v1/recruitment_campaigns?id=eq.${encodeURIComponent(prospect.campaign_id)}&select=reply_to_email&limit=1`,
              { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' } }
            );
            if (campRes.ok) {
              const [camp] = await campRes.json();
              if (camp?.reply_to_email) replyTo = camp.reply_to_email;
            }
          } catch { /* use default */ }
        }

        // Send via Resend
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Legacy Financial Recruiting <recruiting@legacyfinancial.app>',
            to: [prospect.email],
            subject: emailSubject,
            text: emailBody,
            reply_to: replyTo,
            headers: {
              'X-Legacy-Template': 'recruitment',
              'X-Legacy-Prospect-Id': String(id),
            },
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
        update.sent_at = new Date().toISOString();
        break;

      case 'mark_called':
        update.properties = {
          ...(prospect.properties || {}),
          call_made_at: new Date().toISOString(),
          call_outcome: String(callOutcome || 'no_answer').slice(0, 50),
        };
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
