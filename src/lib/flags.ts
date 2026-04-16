/**
 * Feature‑flag definitions for the quote‑lead flow.
 *
 * These are used in two places:
 *   1.  The /.well-known/vercel/flags discovery endpoint (so Vercel Toolbar
 *       and Flags Explorer can display them).
 *   2.  Emitted to the DOM via a data‑flag‑values <script> tag so client‑side
 *       Vercel Analytics custom events are automatically annotated with the
 *       active flag values.
 *
 * For now flags are resolved from env vars.  When a provider like LaunchDarkly
 * or Statsig is added later the `resolve*` helpers can be swapped.
 */

import type { FlagDefinitionsType, FlagValuesType } from 'flags';

// ── definitions (metadata shown in Vercel Toolbar) ──────────────────

export const FLAG_DEFINITIONS: FlagDefinitionsType = {
  'quote-flow-variant': {
    description: 'Which variant of the quote flow the visitor sees.',
    options: [
      { value: 'control', label: 'Control' },
      { value: 'streamlined', label: 'Streamlined' },
    ],
  },
  'quote-confirmation-variant': {
    description: 'Confirmation page variant after quote submission.',
    options: [
      { value: 'default', label: 'Default' },
      { value: 'warm', label: 'Warm / personal tone' },
    ],
  },
  'ringy-enabled': {
    description: 'Whether leads are pushed to the Ringy CRM.',
    options: [
      { value: true, label: 'Enabled' },
      { value: false, label: 'Disabled' },
    ],
  },
};

// ── runtime resolution ──────────────────────────────────────────────

/**
 * Resolve current flag values.  Called at request time on server‑rendered
 * pages and inside API routes.
 */
export function resolveFlagValues(): FlagValuesType {
  return {
    'quote-flow-variant': resolveEnvString('FLAG_QUOTE_FLOW_VARIANT', 'control'),
    'quote-confirmation-variant': resolveEnvString('FLAG_QUOTE_CONFIRMATION_VARIANT', 'default'),
    'ringy-enabled': resolveBoolEnv('FLAG_RINGY_ENABLED', true),
  };
}

/**
 * Return which flag keys to annotate on a given Vercel custom event.
 */
export function quoteFlowFlagKeys(): string[] {
  return ['quote-flow-variant', 'quote-confirmation-variant', 'ringy-enabled'];
}

// ── tiny helpers ────────────────────────────────────────────────────

function resolveEnvString(key: string, fallback: string): string {
  // import.meta.env is only available inside Astro modules at build/runtime.
  // When this file is used inside an API route the env is populated by Vercel.
  try {
    const val = ((import.meta as any).env?.[key] ?? process.env[key])?.trim();
    return val || fallback;
  } catch {
    return fallback;
  }
}

function resolveBoolEnv(key: string, fallback: boolean): boolean {
  try {
    const raw = ((import.meta as any).env?.[key] ?? process.env[key])?.trim()?.toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}
