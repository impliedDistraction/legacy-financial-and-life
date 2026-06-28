import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function supaHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supa(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...supaHeaders(), ...(opts.headers || {}) },
  });
}

/**
 * GET /api/survey-campaigns
 * List all survey campaigns with their questions and response stats.
 * Optional: ?id=<uuid> to get a single campaign with full details.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'DB not configured' }, 503);

  const id = url.searchParams.get('id');

  if (id) {
    // Fetch single campaign with questions and responses
    const [campRes, questionsRes, sendsRes, responsesRes] = await Promise.all([
      supa(`survey_campaigns?id=eq.${encodeURIComponent(id)}&limit=1`),
      supa(`survey_questions?campaign_id=eq.${encodeURIComponent(id)}&order=question_order.asc`),
      supa(`survey_sends?campaign_id=eq.${encodeURIComponent(id)}&select=id,prospect_id,sent_at,responded,responded_at`),
      supa(`survey_responses?campaign_id=eq.${encodeURIComponent(id)}&select=question_id,answer_value,prospect_id,answered_at`),
    ]);

    if (!campRes.ok) return jsonRes({ error: 'Failed to fetch campaign' }, 500);
    const [campaign] = await campRes.json();
    if (!campaign) return jsonRes({ error: 'Campaign not found' }, 404);

    const questions = questionsRes.ok ? await questionsRes.json() : [];
    const sends = sendsRes.ok ? await sendsRes.json() : [];
    const responses = responsesRes.ok ? await responsesRes.json() : [];

    // Aggregate responses per question
    const responsesByQuestion: Record<string, Record<string, number>> = {};
    for (const r of responses) {
      if (!responsesByQuestion[r.question_id]) responsesByQuestion[r.question_id] = {};
      const counts = responsesByQuestion[r.question_id];
      counts[r.answer_value] = (counts[r.answer_value] || 0) + 1;
    }

    return jsonRes({
      campaign,
      questions: questions.map((q: any) => ({
        ...q,
        response_counts: responsesByQuestion[q.id] || {},
      })),
      sends: sends.length,
      responded: sends.filter((s: any) => s.responded).length,
      total_responses: responses.length,
      unique_respondents: new Set(responses.map((r: any) => r.prospect_id)).size,
    });
  }

  // List all campaigns with accurate counts from survey_sends
  // Use limit=50000 to avoid Supabase's default 1000-row pagination cutoff
  const [campRes, sendsCountRes, questionsCountRes] = await Promise.all([
    supa('survey_campaigns?order=created_at.desc'),
    supa('survey_sends?select=campaign_id,responded&limit=50000'),
    supa('survey_questions?select=campaign_id&limit=5000'),
  ]);
  if (!campRes.ok) return jsonRes({ error: 'Failed to fetch campaigns' }, 500);
  const campaigns = await campRes.json();
  const allSends = sendsCountRes.ok ? await sendsCountRes.json() : [];
  const allQuestions = questionsCountRes.ok ? await questionsCountRes.json() : [];

  // Build accurate counts per campaign from survey_sends (truth source)
  const sendCounts: Record<string, { sent: number; responded: number }> = {};
  for (const s of allSends) {
    if (!sendCounts[s.campaign_id]) sendCounts[s.campaign_id] = { sent: 0, responded: 0 };
    sendCounts[s.campaign_id].sent++;
    if (s.responded) sendCounts[s.campaign_id].responded++;
  }

  // Count questions per campaign
  const questionCounts: Record<string, number> = {};
  for (const q of allQuestions) {
    questionCounts[q.campaign_id] = (questionCounts[q.campaign_id] || 0) + 1;
  }

  // Override cached counts with accurate values
  for (const c of campaigns) {
    const accurate = sendCounts[c.id];
    if (accurate) {
      c.send_count = accurate.sent;
      c.response_count = accurate.responded;
    }
    c._questionCount = questionCounts[c.id] || 0;
  }

  return jsonRes({ campaigns });
};

/**
 * POST /api/survey-campaigns
 * Create or update a survey campaign.
 *
 * Body for create:
 *   { name, description?, target_states[], target_statuses[], properties?, questions: [{question_text, question_type, options, question_order}] }
 *
 * Body for update (include id):
 *   { id, ...fields to update, questions?: [...] }
 *
 * Body for status change:
 *   { id, action: 'activate' | 'pause' | 'complete' }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'DB not configured' }, 503);

  const body = await request.json();
  const { id, action } = body;

  // Status change action
  if (id && action) {
    const statusMap: Record<string, string> = {
      activate: 'active',
      pause: 'paused',
      complete: 'completed',
    };
    const newStatus = statusMap[action];
    if (!newStatus) return jsonRes({ error: 'Invalid action' }, 400);

    const res = await supa(`survey_campaigns?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return jsonRes({ error: 'Update failed' }, 500);
    const [updated] = await res.json();
    return jsonRes({ campaign: updated });
  }

  // Update existing campaign
  if (id) {
    const { name, description, target_states, target_statuses, properties, questions } = body;
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (target_states !== undefined) patch.target_states = target_states;
    if (target_statuses !== undefined) patch.target_statuses = target_statuses;
    if (properties !== undefined) patch.properties = properties;

    const res = await supa(`survey_campaigns?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return jsonRes({ error: 'Update failed' }, 500);
    const [updated] = await res.json();

    // If questions are provided, upsert them
    if (questions && Array.isArray(questions)) {
      // Delete existing questions and re-insert (simpler than upsert for ordered items)
      await supa(`survey_questions?campaign_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (questions.length > 0) {
        const qRows = questions.map((q: any, i: number) => ({
          campaign_id: id,
          question_order: q.question_order ?? i,
          question_text: q.question_text,
          question_type: q.question_type || 'single_choice',
          options: q.options || [],
          required: q.required ?? true,
        }));
        await supa('survey_questions', {
          method: 'POST',
          body: JSON.stringify(qRows),
        });
      }
    }

    return jsonRes({ campaign: updated });
  }

  // Create new campaign
  const { name, description, target_states, target_statuses, properties, questions } = body;
  if (!name) return jsonRes({ error: 'name is required' }, 400);

  const campRes = await supa('survey_campaigns', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name,
      description: description || null,
      target_states: target_states || [],
      target_statuses: target_statuses || [],
      properties: properties || {},
    }),
  });
  if (!campRes.ok) {
    const err = await campRes.text();
    return jsonRes({ error: `Create failed: ${err}` }, 500);
  }
  const [campaign] = await campRes.json();

  // Insert questions
  if (questions && Array.isArray(questions) && questions.length > 0) {
    const qRows = questions.map((q: any, i: number) => ({
      campaign_id: campaign.id,
      question_order: q.question_order ?? i,
      question_text: q.question_text,
      question_type: q.question_type || 'single_choice',
      options: q.options || [],
      required: q.required ?? true,
    }));
    await supa('survey_questions', {
      method: 'POST',
      body: JSON.stringify(qRows),
    });
  }

  return jsonRes({ campaign }, 201);
};
