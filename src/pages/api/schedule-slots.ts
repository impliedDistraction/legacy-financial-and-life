import type { APIRoute } from 'astro';

export const prerender = false;

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_SECRET = import.meta.env.OLLAMA_SECRET || '';

/**
 * GET /api/schedule-slots — Returns available Calendly time slots.
 *
 * Proxies to Sentinel's Calendly scheduling library via the Ollama/scheduler
 * proxy, or directly calls the Calendly API from server side.
 *
 * Query params:
 *   ?days=7    Number of days ahead to check (default 7, max 14)
 *   ?max=6     Maximum slots to return (default 6, max 12)
 */

const CALENDLY_API_KEY = import.meta.env.CALENDLY_API_KEY || import.meta.env.LEGACY_FINANCIAL_CLIENT_TIM_CALENDLY_API_KEY || '';
const CALENDLY_EVENT_TYPE_UUID = import.meta.env.CALENDLY_EVENT_TYPE_UUID || '';
const CALENDLY_SCHEDULING_ENABLED = import.meta.env.CALENDLY_SCHEDULING_ENABLED === 'true';
const CALENDLY_BASE = 'https://api.calendly.com';

// Rate limit: max 10 requests per IP per 5 minutes
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export const GET: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!CALENDLY_SCHEDULING_ENABLED || !CALENDLY_API_KEY || !CALENDLY_EVENT_TYPE_UUID) {
    // Graceful degradation — return Calendly link instead of slots
    return new Response(JSON.stringify({
      available: false,
      fallbackUrl: 'https://calendly.com/bethandtim-legacyf-l/30min',
      message: 'Direct scheduling not available — use the booking link',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const daysAhead = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 14);
  const maxSlots = Math.min(parseInt(url.searchParams.get('max') || '6', 10), 12);
  const minLeadMinutes = 30;

  const now = new Date();
  const minTime = new Date(now.getTime() + minLeadMinutes * 60000);
  const maxTime = new Date(now.getTime() + daysAhead * 86400000);

  const eventTypeUri = `https://api.calendly.com/event_types/${CALENDLY_EVENT_TYPE_UUID}`;
  const params = new URLSearchParams({
    event_type: eventTypeUri,
    start_time: minTime.toISOString(),
    end_time: maxTime.toISOString(),
  });

  try {
    const res = await fetch(`${CALENDLY_BASE}/event_type_available_times?${params}`, {
      headers: {
        Authorization: `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[schedule-slots] Calendly API error: ${res.status}`);
      return new Response(JSON.stringify({
        available: false,
        fallbackUrl: 'https://calendly.com/bethandtim-legacyf-l/30min',
        message: 'Unable to load times — use the booking link',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const collection = data.collection || [];

    const slots = collection
      .filter((slot: any) => slot.status === 'available')
      .slice(0, maxSlots)
      .map((slot: any) => ({
        start: slot.start_time,
        end: slot.end_time || new Date(new Date(slot.start_time).getTime() + 30 * 60000).toISOString(),
      }));

    return new Response(JSON.stringify({
      available: true,
      slots,
      eventType: '30-Minute Conversation',
      fallbackUrl: 'https://calendly.com/bethandtim-legacyf-l/30min',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' },
    });
  } catch (err: any) {
    console.error(`[schedule-slots] Fetch error:`, err.message);
    return new Response(JSON.stringify({
      available: false,
      fallbackUrl: 'https://calendly.com/bethandtim-legacyf-l/30min',
      message: 'Unable to load times',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * POST /api/schedule-slots — Book a specific time slot.
 *
 * Body:
 *   { startTime: string, name: string, email: string, phone?: string, prospectId?: string }
 */
export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!CALENDLY_SCHEDULING_ENABLED || !CALENDLY_API_KEY || !CALENDLY_EVENT_TYPE_UUID) {
    return new Response(JSON.stringify({
      success: false,
      fallbackUrl: 'https://calendly.com/bethandtim-legacyf-l/30min',
      error: 'Direct booking not available — please use the scheduling link',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { startTime, name, email, phone, prospectId } = body;

    if (!startTime || !name || !email) {
      return new Response(JSON.stringify({ success: false, error: 'startTime, name, and email are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate start time is in the future
    const slotTime = new Date(startTime);
    if (isNaN(slotTime.getTime()) || slotTime.getTime() < Date.now() + 25 * 60000) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or too-soon time slot' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Book via Calendly Scheduling API
    const eventTypeUri = `https://api.calendly.com/event_types/${CALENDLY_EVENT_TYPE_UUID}`;
    const payload: any = {
      event_type: eventTypeUri,
      start_time: startTime,
      invitee: {
        name,
        email,
      },
      tracking: {
        utm_source: 'chatbot',
        utm_medium: 'ai-agent',
        utm_campaign: prospectId || 'direct',
      },
    };
    if (phone) payload.invitee.phone_number = phone;

    const res = await fetch(`${CALENDLY_BASE}/one_off_event_types/${CALENDLY_EVENT_TYPE_UUID}/invitees`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      return new Response(JSON.stringify({
        success: false,
        error: 'That time was just taken — please choose another slot.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (res.status === 422) {
      return new Response(JSON.stringify({
        success: false,
        error: 'That time is no longer available.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!res.ok) {
      console.error(`[schedule-slots] Booking error: ${res.status}`);
      return new Response(JSON.stringify({
        success: false,
        fallbackUrl: 'https://calendly.com/bethandtim-legacyf-l/30min',
        error: 'Booking failed — please use the scheduling link.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const result = await res.json();

    // Update prospect stage if we have an ID
    if (prospectId) {
      const sbUrl = import.meta.env.SUPABASE_URL?.trim();
      const sbKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (sbUrl && sbKey) {
        try {
          await fetch(
            `${sbUrl}/rest/v1/recruitment_prospects?id=eq.${encodeURIComponent(prospectId)}`,
            {
              method: 'PATCH',
              headers: {
                apikey: sbKey,
                Authorization: `Bearer ${sbKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify({
                interaction_stage: 'booked',
                updated_at: new Date().toISOString(),
              }),
            }
          );
        } catch { /* non-critical */ }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      startTime,
      confirmationUrl: result.resource?.booking_url || null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[schedule-slots] POST error:`, err.message);
    return new Response(JSON.stringify({ success: false, error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
