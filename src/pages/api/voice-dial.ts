import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

export const prerender = false;

/**
 * POST /api/voice-dial
 * Proxy to the Sentinel voice bridge to initiate an outbound AI sales call.
 * Body: { phone, prospectName, prospectContext, testMode, transferNumber }
 */
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
    const { phone, prospectName, prospectContext, testMode, transferNumber, scriptId } = body;

    if (!phone || typeof phone !== 'string') {
      return new Response(JSON.stringify({ error: 'Phone number required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!transferNumber || typeof transferNumber !== 'string') {
      return new Response(JSON.stringify({ error: 'Transfer number required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If a specific script was selected, fetch its tree data and pass along
    let treeData: any = undefined;
    let treeCategory: string | undefined = undefined;
    if (scriptId && typeof scriptId === 'string' && scriptId.length > 10) {
      const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          const treeRes = await fetch(
            `${SUPABASE_URL}/rest/v1/dialog_trees?id=eq.${encodeURIComponent(scriptId)}&select=tree_data,category`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
          );
          if (treeRes.ok) {
            const rows = await treeRes.json();
            if (rows.length > 0) {
              treeData = rows[0].tree_data;
              treeCategory = rows[0].category;
            }
          }
        } catch { /* proceed without custom tree */ }
      }
    }

    const res = await bridgeFetch('/dial/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone, prospectName, prospectContext,
        testMode: !!testMode, transferNumber,
        ...(treeData ? { treeData, treeCategory } : {}),
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : res.status === 429 ? 429 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[voice-dial] Bridge unreachable:', err.message);
    return new Response(
      JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
