import type { APIRoute } from 'astro';

export const prerender = false;

const CALENDLY_API = 'https://api.calendly.com';
const BOOKING_SLUG = '30min';

// Cache availability for 5 minutes to avoid hammering the API
let cache: { data: unknown; expires: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/** Extract user_uuid from Calendly PAT (JWT) to build user URI without users:read scope */
function userUriFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return `${CALENDLY_API}/users/${payload.user_uuid}`;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async () => {
  const apiKey = import.meta.env.CALENDLY_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Scheduling service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Return cached response if fresh
  if (cache && Date.now() < cache.expires) {
    return new Response(JSON.stringify(cache.data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  try {
    // Derive user URI from the JWT payload (avoids needing users:read scope)
    const userUri = userUriFromToken(apiKey);
    if (!userUri) throw new Error('Invalid API token');

    // Find the 30min event type
    const typesRes = await fetch(
      `${CALENDLY_API}/event_types?user=${encodeURIComponent(userUri)}&active=true`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!typesRes.ok) throw new Error('Failed to fetch event types');
    const types = await typesRes.json();

    const eventType = types.collection.find(
      (t: { slug: string }) => t.slug === BOOKING_SLUG
    );
    if (!eventType) {
      return new Response(JSON.stringify({ error: 'Event type not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get available times for the next 7 days (start 1 min from now to satisfy "must be in the future")
    const now = new Date(Date.now() + 60_000);
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const availRes = await fetch(
      `${CALENDLY_API}/event_type_available_times?event_type=${encodeURIComponent(eventType.uri)}&start_time=${now.toISOString()}&end_time=${weekOut.toISOString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!availRes.ok) throw new Error('Failed to fetch availability');
    const avail = await availRes.json();

    // Build a compact response: next 5 available slots
    const slots = (avail.collection || [])
      .filter((s: { status: string }) => s.status === 'available')
      .slice(0, 5)
      .map((s: { start_time: string }) => s.start_time);

    const result = {
      nextAvailable: slots[0] || null,
      slots,
      eventType: {
        name: eventType.name,
        duration: eventType.duration,
      },
    };

    cache = { data: result, expires: Date.now() + CACHE_TTL };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Unable to check availability' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
