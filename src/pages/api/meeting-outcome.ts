import type { APIRoute } from 'astro';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const HMAC_SECRET = import.meta.env.UNSUBSCRIBE_HMAC_SECRET?.trim()
  || import.meta.env.OPENCLAW_SECRET?.trim()
  || '';

// Fieldwork Systems Supabase (for team membership creation)
const FW_SUPABASE_URL = import.meta.env.FWSYS_SUPABASE_URL?.trim() || import.meta.env.WO_SUPABASE_URL?.trim();
const FW_SUPABASE_KEY = import.meta.env.FWSYS_SUPABASE_SERVICE_ROLE_KEY?.trim() || import.meta.env.WO_SUPABASE_SERVICE_ROLE_KEY?.trim();

// Valid outcomes for recruiter and prospect roles
const RECRUITER_OUTCOMES = ['committed', 'interested', 'not_interested', 'no_show'];
const PROSPECT_OUTCOMES = ['planning_to_join', 'thinking', 'not_for_me'];
const ALL_OUTCOMES = [...RECRUITER_OUTCOMES, ...PROSPECT_OUTCOMES];

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyOutcomeToken(eventId: string, outcome: string, token: string): Promise<boolean> {
  if (!HMAC_SECRET || !token || !eventId || !outcome) return false;
  const expected = await hmacHex(HMAC_SECRET, `meeting-outcome:${eventId}:${outcome}`);
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function fwHeaders() {
  return {
    apikey: FW_SUPABASE_KEY!,
    Authorization: `Bearer ${FW_SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Rate limiting
const ipCounts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + 300_000 }); // 5 min window
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSuccessPage(outcome: string, inviteeName: string): string {
  const messages: Record<string, { emoji: string; title: string; body: string }> = {
    committed: {
      emoji: '🤝',
      title: 'Awesome — Recruitment Planned!',
      body: `We'll keep ${inviteeName} warm through the transition and track their progress.`,
    },
    interested: {
      emoji: '👍',
      title: 'Got It — Interested',
      body: `We'll schedule a follow-up with ${inviteeName} and keep them engaged.`,
    },
    not_interested: {
      emoji: '👎',
      title: 'Noted — Not a Fit',
      body: 'No further outreach will be sent for this prospect.',
    },
    no_show: {
      emoji: '🚫',
      title: 'No Show Recorded',
      body: `We'll send ${inviteeName} a reschedule opportunity.`,
    },
    planning_to_join: {
      emoji: '🎉',
      title: 'Glad to Hear It!',
      body: 'We\'ll stay in touch as you get started on the transition.',
    },
    thinking: {
      emoji: '🤔',
      title: 'No Rush',
      body: 'We\'ll follow up when the time is right. No pressure.',
    },
    not_for_me: {
      emoji: '👋',
      title: 'Thanks for the Honesty',
      body: 'We appreciate your time. No further outreach will be sent.',
    },
  };

  const msg = messages[outcome] || { emoji: '✅', title: 'Recorded', body: 'Thanks for your response.' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${msg.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 48px 32px; text-align: center; max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .emoji { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #1e293b; margin-bottom: 12px; }
    p { font-size: 15px; color: #64748b; line-height: 1.5; }
    .close-note { margin-top: 24px; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${msg.emoji}</div>
    <h1>${escHtml(msg.title)}</h1>
    <p>${msg.body}</p>
    <p class="close-note">You can close this tab.</p>
  </div>
</body>
</html>`;
}

/**
 * GET /api/meeting-outcome?eid={eventId}&outcome={status}&role={recruiter|prospect}&token={hmac}
 *
 * One-click outcome recording from email buttons.
 * Records the outcome and optionally promotes prospect status.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('cf-connecting-ip')
    || 'unknown';

  if (isRateLimited(ip)) {
    return new Response('Rate limited', { status: 429 });
  }

  const eventId = url.searchParams.get('eid');
  const outcome = url.searchParams.get('outcome');
  const role = url.searchParams.get('role') || 'recruiter';
  const token = url.searchParams.get('token');

  if (!eventId || !outcome || !token) {
    return new Response(renderSuccessPage('invalid', ''), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Validate outcome is in allowed set
  if (!ALL_OUTCOMES.includes(outcome)) {
    return new Response('Invalid outcome', { status: 400 });
  }

  // Verify HMAC
  if (!(await verifyOutcomeToken(eventId, outcome, token))) {
    return new Response('Invalid or expired link', { status: 403 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Server configuration error', { status: 500 });
  }

  // Check if outcome already recorded for this event+role
  const checkUrl = `${SUPABASE_URL}/rest/v1/meeting_outcomes?event_id=eq.${eventId}&reported_via=eq.${role}&select=id&limit=1`;
  const checkRes = await fetch(checkUrl, { headers: supabaseHeaders() });
  let alreadyRecorded = false;
  if (checkRes.ok) {
    const existing = await checkRes.json();
    alreadyRecorded = existing.length > 0;
  }

  // Fetch event for context (invitee name, prospect_id)
  const eventUrl = `${SUPABASE_URL}/rest/v1/calendly_events?id=eq.${eventId}&select=id,invitee_name,prospect_id&limit=1`;
  const eventRes = await fetch(eventUrl, { headers: supabaseHeaders() });
  let inviteeName = 'this prospect';
  let prospectId: string | null = null;
  if (eventRes.ok) {
    const [event] = await eventRes.json();
    if (event) {
      inviteeName = event.invitee_name || inviteeName;
      prospectId = event.prospect_id;
    }
  }

  if (!alreadyRecorded) {
    const now = new Date().toISOString();

    // Insert meeting outcome
    await fetch(`${SUPABASE_URL}/rest/v1/meeting_outcomes`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_id: eventId,
        outcome_status: outcome,
        reported_via: role,
        reported_at: now,
      }),
    });

    // Mark event as outcome recorded
    await fetch(`${SUPABASE_URL}/rest/v1/calendly_events?id=eq.${eventId}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ outcome_recorded: true, updated_at: now }),
    });

    // Promote prospect status based on outcome
    if (prospectId) {
      let newStatus: string | null = null;
      let newInteractionStage: string | null = null;

      if (outcome === 'committed' || outcome === 'planning_to_join') {
        newStatus = 'committing';
        newInteractionStage = 'recruitment_planned';
      } else if (outcome === 'not_interested' || outcome === 'not_for_me') {
        // Don't change status — just record outcome. Recruiter can manually reject.
        newInteractionStage = 'meeting_declined';
      } else if (outcome === 'no_show') {
        newInteractionStage = 'no_show';
      } else if (outcome === 'interested') {
        newInteractionStage = 'meeting_positive';
      }

      if (newStatus || newInteractionStage) {
        const patch: Record<string, string> = { updated_at: now };
        if (newStatus) patch.status = newStatus;
        if (newInteractionStage) patch.interaction_stage = newInteractionStage;
        if (newStatus === 'committing') patch.committed_at = now;

        await fetch(`${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${prospectId}`, {
          method: 'PATCH',
          headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify(patch),
        });

        if ((outcome === 'committed' || outcome === 'planning_to_join')) {
          const prospectRes = await fetch(
            `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${prospectId}&select=campaign_id&limit=1`,
            { headers: supabaseHeaders() },
          );
          if (prospectRes.ok) {
            const [prospect] = await prospectRes.json();
            if (prospect?.campaign_id) {
              await fetch(`${SUPABASE_URL}/rest/v1/campaign_returns`, {
                method: 'POST',
                headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
                body: JSON.stringify({
                  campaign_kind: 'recruitment',
                  recruitment_campaign_id: prospect.campaign_id,
                  prospect_id: prospectId,
                  return_type: 'recruitment_commitment',
                  return_status: 'observed',
                  source: 'calendly',
                  properties: { calendly_event_id: eventId, meeting_outcome: outcome, reported_via: role },
                }),
              });
            }
          }
        }

        // Create team membership on Fieldwork Systems when committing
        if (newStatus === 'committing' && FW_SUPABASE_URL && FW_SUPABASE_KEY) {
          try {
            // Fetch prospect details (name, email, campaign_id)
            const prospectUrl = `${SUPABASE_URL}/rest/v1/recruitment_prospects?id=eq.${prospectId}&select=name,email,campaign_id&limit=1`;
            const prospectRes = await fetch(prospectUrl, { headers: supabaseHeaders() });
            if (prospectRes.ok) {
              const [prospect] = await prospectRes.json();
              if (prospect) {
                // Look up campaign to find recruiter slug
                let recruiterSlug = '';
                if (prospect.campaign_id) {
                  const campUrl = `${SUPABASE_URL}/rest/v1/recruitment_campaigns?id=eq.${prospect.campaign_id}&select=name,client&limit=1`;
                  const campRes = await fetch(campUrl, { headers: supabaseHeaders() });
                  if (campRes.ok) {
                    const [campaign] = await campRes.json();
                    // Campaign client field or properties may contain the recruiter slug
                    // For now, use the campaign client as the recruiter identifier
                    recruiterSlug = campaign?.client || 'legacy';
                  }
                }

                // Find the recruiter's showcase site on Fieldwork Systems
                const recruiterSiteUrl = `${FW_SUPABASE_URL}/rest/v1/wo_showcase_sites?slug=eq.${encodeURIComponent(recruiterSlug)}&status=eq.claimed&select=id,slug&limit=1`;
                const recruiterSiteRes = await fetch(recruiterSiteUrl, { headers: fwHeaders() });
                let recruiterSiteId: string | null = null;
                let finalRecruiterSlug = recruiterSlug;

                if (recruiterSiteRes.ok) {
                  const [rSite] = await recruiterSiteRes.json();
                  if (rSite) {
                    recruiterSiteId = rSite.id;
                    finalRecruiterSlug = rSite.slug;
                  }
                }

                // Create team membership (if we found the recruiter's site)
                if (recruiterSiteId && prospect.email) {
                  await fetch(`${FW_SUPABASE_URL}/rest/v1/wo_agent_teams`, {
                    method: 'POST',
                    headers: { ...fwHeaders(), Prefer: 'return=minimal' },
                    body: JSON.stringify({
                      recruiter_site_id: recruiterSiteId,
                      recruiter_slug: finalRecruiterSlug,
                      member_email: prospect.email,
                      member_name: prospect.name || inviteeName,
                      prospect_id: prospectId,
                      campaign_id: prospect.campaign_id,
                      status: 'committing',
                      committed_at: now,
                      warmth_score: 100,
                    }),
                  });
                }
              }
            }
          } catch {
            // Non-fatal: team creation failure shouldn't block outcome recording
          }
        }
      }
    }
  }

  // Return success page
  return new Response(renderSuccessPage(outcome, inviteeName), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
