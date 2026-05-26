import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = 'send_settings';

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

// Allowed setting keys and their min/max ranges
const SETTINGS_SCHEMA: Record<string, { min: number; max: number; label: string }> = {
  send_target_per_hour: { min: 1, max: 20, label: 'Target per hour' },
  send_daily_hard_cap: { min: 10, max: 1000, label: 'Daily hard cap' },
  send_hourly_hard_cap: { min: 1, max: 50, label: 'Hourly hard cap' },
  send_catchup_max_per_hour: { min: 0, max: 10, label: 'Catch-up max/hr' },
  send_window_start: { min: 0, max: 23, label: 'Window start (ET)' },
  send_window_end: { min: 1, max: 24, label: 'Window end (ET)' },
};

/**
 * GET /api/send-settings — fetch current send velocity settings
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=key,value,updated_at,updated_by`, {
      headers: supaHeaders(),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();

    // Convert to object
    const settings: Record<string, { value: string; updated_at: string; updated_by: string }> = {};
    for (const row of rows) {
      settings[row.key] = { value: row.value, updated_at: row.updated_at, updated_by: row.updated_by };
    }

    // Calculate effective rates for display
    const targetPerHour = parseInt(settings.send_target_per_hour?.value || '6');
    const windowStart = parseInt(settings.send_window_start?.value || '8');
    const windowEnd = parseInt(settings.send_window_end?.value || '18');
    const businessHours = windowEnd - windowStart;
    const dailyTarget = targetPerHour * 24;
    const effectiveRate = businessHours > 0 ? Math.round((dailyTarget / businessHours) * 10) / 10 : 0;

    return jsonRes({
      settings,
      computed: {
        dailyTarget,
        effectiveRatePerHour: effectiveRate,
        businessHours,
        maxDailyWithCatchup: Math.min(
          parseInt(settings.send_daily_hard_cap?.value || '200'),
          (effectiveRate + parseInt(settings.send_catchup_max_per_hour?.value || '6')) * businessHours
        ),
      },
      schema: SETTINGS_SCHEMA,
    });
  } catch (err: unknown) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
};

/**
 * POST /api/send-settings — update one or more settings
 * Body: { settings: { key: value, key: value, ... } }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  try {
    const body = await request.json();
    const updates = body.settings;
    if (!updates || typeof updates !== 'object') return jsonRes({ error: 'settings object required' }, 400);

    const results: Record<string, string> = {};

    for (const [key, rawValue] of Object.entries(updates)) {
      // Validate key
      if (!SETTINGS_SCHEMA[key]) continue;

      // Validate value
      const numVal = parseInt(String(rawValue));
      if (isNaN(numVal)) continue;

      const { min, max } = SETTINGS_SCHEMA[key];
      const clampedVal = Math.max(min, Math.min(max, numVal));

      // Upsert
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          value: String(clampedVal),
          updated_at: new Date().toISOString(),
          updated_by: session.email || 'dashboard',
        }),
      });

      if (!res.ok) {
        // Try insert if row doesn't exist
        await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
          method: 'POST',
          headers: { ...supaHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            key,
            value: String(clampedVal),
            updated_at: new Date().toISOString(),
            updated_by: session.email || 'dashboard',
          }),
        });
      }

      results[key] = String(clampedVal);
    }

    return jsonRes({ updated: results });
  } catch (err: unknown) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
};
