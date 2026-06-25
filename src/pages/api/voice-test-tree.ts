import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SENTINEL_LOCAL = 'http://localhost:3377';
const SENTINEL_URL = (
  import.meta.env.VOICE_BRIDGE_URL?.trim()
  || import.meta.env.OLLAMA_URL?.trim()?.replace(/\/+$/, '')
  || SENTINEL_LOCAL
);

/** Fetch from Sentinel main server (port 3377), not voice bridge (3380) */
async function sentinelFetch(path: string, opts?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${SENTINEL_LOCAL}${path}`, {
      ...opts,
      signal: AbortSignal.timeout(30000),
    });
    return res;
  } catch {
    // localhost unreachable — expected on Vercel
  }
  return fetch(`${SENTINEL_URL}${path}`, {
    ...opts,
    signal: AbortSignal.timeout(30000),
  });
}

/**
 * POST /api/voice-test-tree — Run synthetic scenario tests against a dialog tree
 *
 * Body: { tree_data, scenario?, runs? }
 *   - tree_data: The full dialog tree JSON to test
 *   - scenario: (optional) Run a specific scenario name
 *   - runs: (optional, default 10) Number of stochastic runs per scenario
 *
 * Returns: { report, baseline, category }
 *   - report.deployable: boolean — whether the tree passes all gates
 *   - report.overallScore: 0-100 composite
 *   - report.scenarioResults: per-scenario breakdown
 *   - report.blockers: string[] of deployment blockers
 *   - baseline: category-specific scoring thresholds
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { tree_data, scenario, runs = 10 } = body;
  if (!tree_data || typeof tree_data !== 'object' || !tree_data._meta) {
    return new Response(JSON.stringify({ error: 'tree_data with _meta required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cap runs to prevent abuse
  const safeRuns = Math.min(Math.max(1, Number(runs) || 10), 50);

  try {
    const res = await sentinelFetch('/test-tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree_data, scenario, runs: safeRuns }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Test runner failed' }));
      return new Response(JSON.stringify(errData), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Test runner unreachable', detail: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
