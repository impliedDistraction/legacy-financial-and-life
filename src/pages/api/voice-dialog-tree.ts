import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';
import { bridgeFetch } from '../../lib/voice-bridge';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const prerender = false;

/**
 * GET /api/voice-dialog-tree
 *   ?raw=true  — Returns the raw tree JSON (for editor)
 *   ?list=true — Returns list of saved trees from Supabase
 *   (default)  — Returns graph visualization format from bridge
 *
 * POST /api/voice-dialog-tree
 *   Save/update a dialog tree to Supabase
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // List saved trees from Supabase
  if (url.searchParams.get('list') === 'true') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response(JSON.stringify({ trees: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/dialog_trees?select=id,name,slug,category,status,version,created_at,updated_at&order=updated_at.desc&limit=50`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const trees = res.ok ? await res.json() : [];
      return new Response(JSON.stringify({ trees }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ trees: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Load specific tree by ID from Supabase
  const treeId = url.searchParams.get('id');
  if (treeId && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/dialog_trees?id=eq.${encodeURIComponent(treeId)}&select=*`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0) {
          return new Response(JSON.stringify(rows[0]), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    } catch {}
    return new Response(JSON.stringify({ error: 'Tree not found' }), { status: 404 });
  }

  // Raw tree from bridge (for editor)
  if (url.searchParams.get('raw') === 'true') {
    try {
      const res = await bridgeFetch('/dialog-tree?raw=true');
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Default: visualization graph from bridge
  try {
    const res = await bridgeFetch('/dialog-tree');
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Voice bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { tree_data, name, category, status, slug, id } = body;
  if (!tree_data || !name) {
    return new Response(JSON.stringify({ error: 'tree_data and name required' }), { status: 400 });
  }

  // Validate tree has basic structure
  if (typeof tree_data !== 'object' || !tree_data._meta) {
    return new Response(JSON.stringify({ error: 'Invalid tree format: missing _meta' }), { status: 400 });
  }

  const record: any = {
    name: String(name).slice(0, 200),
    slug: String(slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
    category: ['sales', 'recruitment', 'client_outreach', 'custom'].includes(category) ? category : 'custom',
    status: ['draft', 'active', 'testing', 'archived'].includes(status) ? status : 'draft',
    tree_data,
    created_by: session.email,
  };

  // Update existing or create new
  if (id) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dialog_trees?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ ...record, version: body.version ? body.version + 1 : undefined }),
      }
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Update failed', detail: await res.text() }), { status: 500 });
    }
    const rows = await res.json();
    return new Response(JSON.stringify(rows[0] || { id, slug: record.slug }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } else {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dialog_trees`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(record),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: 'Create failed', detail: errText }), { status: 500 });
    }
    const rows = await res.json();
    return new Response(JSON.stringify(rows[0]), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * PUT /api/voice-dialog-tree — Deploy a saved tree to the live voice bridge
 * Body: { id, mode } (mode = "sales" | "recruitment")
 */
export const PUT: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { id, mode = 'sales' } = body;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Tree id required' }), { status: 400 });
  }

  // Fetch tree data from Supabase
  const treeRes = await fetch(
    `${SUPABASE_URL}/rest/v1/dialog_trees?id=eq.${encodeURIComponent(id)}&select=tree_data,name,status`,
    { headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!treeRes.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch tree' }), { status: 500 });
  }
  const rows = await treeRes.json();
  if (!rows.length) {
    return new Response(JSON.stringify({ error: 'Tree not found' }), { status: 404 });
  }

  // Push to bridge's /reload-tree endpoint
  try {
    const bridgeRes = await bridgeFetch('/reload-tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, tree_data: rows[0].tree_data }),
    });
    const bridgeData = await bridgeRes.json();
    if (!bridgeRes.ok) {
      return new Response(JSON.stringify({ error: 'Bridge rejected tree', detail: bridgeData }), { status: 502 });
    }
    return new Response(JSON.stringify({ deployed: true, mode, tree: rows[0].name }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Bridge unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
