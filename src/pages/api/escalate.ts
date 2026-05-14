import type { APIRoute } from 'astro';
import { trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const SENTINEL_URL = import.meta.env.SENTINEL_URL?.trim() || 'http://localhost:3377';

/**
 * POST /api/escalate
 *
 * Receives an escalated technical issue from the chatbot UI.
 * Saves to the escalated_issues table, then pings Sentinel to
 * triage & notify.
 *
 * Body:
 *   summary:      string  (required) — user's description
 *   category:     string  — technical | billing | compliance | other
 *   source:       string  — chatbot | join-chat | manual
 *   sessionId:    string  — chat session for correlation
 *   pageUrl:      string  — originating page
 *   conversation: array   — recent messages [{ role, content }]
 *   userContact:  object  — { name?, email?, phone? }
 */
export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid request body' });
  }

  const summary = String(body.summary ?? '').trim();
  if (!summary || summary.length < 10) {
    return json(400, { error: 'A description of at least 10 characters is required' });
  }
  if (summary.length > 2000) {
    return json(400, { error: 'Description too long (max 2000 characters)' });
  }

  const category = String(body.category ?? 'technical').slice(0, 50);
  const source = String(body.source ?? 'chatbot').slice(0, 50);
  const sessionId = body.sessionId ? String(body.sessionId).slice(0, 200) : null;
  const pageUrl = body.pageUrl ? String(body.pageUrl).slice(0, 500) : null;

  // Sanitize conversation — keep last 20 messages, truncate content
  const conversation = Array.isArray(body.conversation)
    ? body.conversation.slice(-20).map((m: Record<string, unknown>) => ({
        role: String(m.role ?? '').slice(0, 10),
        content: String(m.content ?? '').slice(0, 2000),
      }))
    : null;

  // Sanitize contact info
  const rawContact = (body.userContact ?? {}) as Record<string, unknown>;
  const userContact = {
    name: rawContact.name ? String(rawContact.name).slice(0, 200) : undefined,
    email: rawContact.email ? String(rawContact.email).slice(0, 320) : undefined,
    phone: rawContact.phone ? String(rawContact.phone).slice(0, 30) : undefined,
  };

  // ── Save to Supabase ───────────────────────────────────────────────
  let issueId: string | null = null;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/escalated_issues`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          client: 'legacy-financial',
          source,
          session_id: sessionId,
          page_url: pageUrl,
          category,
          summary,
          conversation,
          user_contact: userContact,
        }),
      });

      if (res.ok) {
        const rows = await res.json();
        issueId = rows?.[0]?.id ?? null;
      } else {
        console.error('[escalate] Supabase insert failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[escalate] Supabase error:', (err as Error).message);
    }
  }

  // ── Ping Sentinel to triage & notify ───────────────────────────────
  try {
    fetch(`${SENTINEL_URL}/api/escalation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueId,
        client: 'legacy-financial',
        category,
        summary,
        source,
        sessionId,
        pageUrl,
        conversation,
        userContact,
      }),
    }).catch((err) => {
      // Fire-and-forget — don't block the user response
      console.error('[escalate] Sentinel ping failed:', err.message);
    });
  } catch {
    // Swallow — Sentinel notification is best-effort
  }

  // ── Track event ────────────────────────────────────────────────────
  trackLeadEvent({
    route: '/api/escalate',
    eventName: 'issue_escalated',
    source: 'server',
    stage: 'handoff',
    status: 'warning',
    ownerScope: 'legacy',
    leadEmail: userContact.email,
    leadPhone: userContact.phone,
    properties: {
      issue_id: issueId,
      category,
      escalation_source: source,
      summary: summary.slice(0, 200),
    },
  }).catch(() => {});

  return json(200, {
    ok: true,
    issueId,
    message: 'Your concern has been recorded. Our team will review it shortly.',
  });
};
