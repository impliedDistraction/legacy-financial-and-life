import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'recruitment_prospects';

/**
 * POST /api/recruitment-upload
 * Accepts a JSON array of prospect records (parsed from CSV on client-side).
 * Inserts them into the recruitment_prospects table with status = 'pending'.
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
    const { prospects, campaignName } = body;

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return new Response(JSON.stringify({ error: 'prospects array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (prospects.length > 500) {
      return new Response(JSON.stringify({ error: 'Max 500 prospects per upload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const campaignId = crypto.randomUUID();
    const campaign = String(campaignName || 'Untitled Campaign').slice(0, 200);

    // Validate and normalize each prospect
    const records = prospects.map((p: Record<string, unknown>) => ({
      name: sanitize(p.name, 200) || 'Unknown',
      email: sanitize(p.email, 200)?.toLowerCase() || null,
      phone: sanitize(p.phone, 40) || null,
      state: sanitize(p.state, 50)?.toUpperCase() || null,
      city: sanitize(p.city, 100) || null,
      experience_level: sanitize(p.experience_level || p.experience, 50) || 'unknown',
      current_agency: sanitize(p.current_agency || p.agency, 200) || null,
      notes: sanitize(p.notes, 500) || null,
      source: 'csv_import',
      campaign_id: campaignId,
      campaign_name: campaign,
      status: 'pending',
      properties: {},
    }));

    // Deduplicate by email within this batch
    const seen = new Set<string>();
    const deduped = records.filter((r) => {
      if (!r.email) return true; // keep records without email
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });

    // Insert into Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(deduped),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.error('Recruitment upload failed:', response.status, err);
      return new Response(JSON.stringify({ error: 'Database insert failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const inserted = await response.json();

    return new Response(JSON.stringify({
      success: true,
      campaignId,
      campaignName: campaign,
      uploaded: deduped.length,
      duplicatesRemoved: records.length - deduped.length,
      total: inserted.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Recruitment upload error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * GET /api/recruitment-upload?campaign_id=...&status=...
 * Fetch prospects (optionally filtered by campaign and/or status).
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

  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaign_id');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let queryUrl = `${SUPABASE_URL}/rest/v1/${TABLE}?order=fit_score.desc.nullslast,created_at.desc&limit=${limit}&offset=${offset}`;
  if (campaignId) queryUrl += `&campaign_id=eq.${encodeURIComponent(campaignId)}`;
  if (status) queryUrl += `&status=eq.${encodeURIComponent(status)}`;

  const response = await fetch(queryUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'Database query failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await response.json();
  const total = response.headers.get('content-range')?.split('/')[1] || '0';

  return new Response(JSON.stringify({ prospects: data, total: parseInt(total) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

function sanitize(value: unknown, maxLen: number): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, maxLen);
}
