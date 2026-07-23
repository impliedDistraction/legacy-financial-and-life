/**
 * A/B testing for /join page.
 *
 * Variants:
 *   A (control)  — Current AI-focused messaging
 *   B            — People & mentorship focus (less AI)
 *   C            — Dynamic messaging based on aggregated survey pain point results
 *
 * Assignment is sticky via cookie. Variant C fetches fresh survey aggregates
 * to weight messaging toward top-reported pain points.
 */

export type JoinVariant = 'A' | 'B' | 'C';

export type ProspectTier = 'new' | 'established' | 'unknown';

// ─── Variant content definitions ───────────────────────────────────

export interface VariantContent {
  hero: { headline: string; subhead: string };
  cards: Array<{ emoji: string; title: string; body: string }>;
  chatOpener: string;
}

// ── Variant A: AI-focused (current control) ────────────────────────

const VARIANT_A: Record<ProspectTier, VariantContent> = {
  established: {
    hero: {
      headline: 'What If Your Busiest Day Was Only Client Calls?',
      subhead: "You didn't get licensed to spend half your week on admin, lead lists, and carrier portals. Legacy Financial & Life gives experienced agents AI-powered tools that handle prospecting and paperwork — so every hour goes to clients and commissions.",
    },
    cards: [
      { emoji: '🤖', title: 'AI Does Your Prospecting', body: 'Our system researches, qualifies, and reaches out to potential clients automatically. You show up to warm conversations.' },
      { emoji: '⏰', title: 'Get Your Hours Back', body: "Compliance tracking, follow-up sequences, and CRM automation — the admin that eats your week, handled for you." },
      { emoji: '�️', title: 'Life, Health & Wealth', body: "Cover every stage of your clients' financial lives — life insurance, health coverage, and retirement planning. One team, full product access." },
    ],
    chatOpener: "Hey! 👋 Sounds like you've been in the industry a while. I'm curious — what does your day actually look like right now? Are you spending your time where you want to be?",
  },
  new: {
    hero: {
      headline: 'Stop Guessing Where Your Next Client Comes From',
      subhead: "Finding qualified prospects is the hardest part of starting out. Legacy Financial & Life gives new agents AI-powered lead systems, direct mentorship, and a team that's transparent about how the business actually works — no trial and error required.",
    },
    cards: [
      { emoji: '🎯', title: 'Leads That Come to You', body: 'AI-powered prospecting finds qualified leads and warms them up before you ever pick up the phone.' },
      { emoji: '👨‍🏫', title: 'Learn What Actually Works', body: '1-on-1 mentorship from agents with 15+ years and 300+ policies. Skip the trial and error.' },
      { emoji: '�', title: 'Full-Time or Part-Time', body: 'Build your practice with the Legacy Financial team. We support full-time and part-time agents through a clear, shared onboarding plan.' },
    ],
    chatOpener: "Hey! 👋 Thanks for checking us out. Getting started in insurance can be a lot — what's been the biggest challenge so far? Where does most of your time end up going?",
  },
  unknown: {
    hero: {
      headline: 'Get Your Time Back — Let AI Handle the Grind',
      subhead: "Lead gen, follow-up, research, compliance tracking — the stuff that eats your week. Legacy Financial & Life agents use AI tools that do the busywork automatically, so you spend more time with clients and less time behind a screen.",
    },
    cards: [
      { emoji: '🤖', title: 'AI-Powered Lead Gen', body: "Stop spending hours on prospecting. Our AI finds, qualifies, and warms up clients for you." },
      { emoji: '⏰', title: 'Full-Time or Part-Time', body: 'Whether you are full-time or part-time, our team helps set a practical schedule and support plan around your responsibilities.' },
      { emoji: '🛡️', title: 'Life, Health & Wealth', body: "Life insurance, health coverage, retirement planning — serve your clients across every financial milestone with full product access." },
    ],
    chatOpener: "Hey! 👋 Thanks for checking us out. I'd love to learn a little about you — what does your day actually look like right now? Where does most of your time go?",
  },
};

// ── Variant B: People & mentorship focus (less AI) ─────────────────

const VARIANT_B: Record<ProspectTier, VariantContent> = {
  established: {
    hero: {
      headline: 'What If Your Busiest Day Was Only Client Calls?',
      subhead: "You built this career to help families — not to drown in admin, carrier portals, and lead lists. Legacy Financial & Life gives experienced agents a support team and proven systems that free up your calendar for real client work.",
    },
    cards: [
      { emoji: '🤝', title: 'A Team That Has Your Back', body: "Dedicated operations support handles follow-ups, paperwork, and compliance so you can focus on relationships that matter." },
      { emoji: '📋', title: 'Proven Systems, Not Guesswork', body: "Our playbook is built on 15+ years and 300+ policies placed. Skip the trial and error — use what already works." },
      { emoji: '�️', title: 'Life, Health & Wealth', body: "Cover every stage of your clients' financial lives — life insurance, health coverage, and retirement planning. One team, full product access." },
    ],
    chatOpener: "Hey! 👋 Sounds like you've been in the industry a while. What does a typical week look like for you? Are you spending your time the way you want?",
  },
  new: {
    hero: {
      headline: "You Don't Have to Figure This Out Alone",
      subhead: "Most new agents wash out because nobody shows them how the business actually works. At Legacy Financial & Life, you get a mentor who's placed 300+ policies, a team that handles the busy work, and a system that puts warm leads on your calendar.",
    },
    cards: [
      { emoji: '👨‍🏫', title: 'Real Mentorship, Day One', body: "1-on-1 coaching from experienced agents. Weekly calls, script practice, and product training until you're confident." },
      { emoji: '🎯', title: 'Leads on Your Calendar', body: "Our team pre-qualifies prospects and books appointments so you walk into warm conversations, not cold calls." },
      { emoji: '�', title: 'Full-Time or Part-Time', body: 'Build your practice with the Legacy Financial team. We support full-time and part-time agents through a clear, shared onboarding plan.' },
    ],
    chatOpener: "Hey! 👋 Thanks for checking us out. Starting in insurance can feel overwhelming — what's been on your mind? Anything you're trying to figure out?",
  },
  unknown: {
    hero: {
      headline: 'Build a Career That Works Around Your Life',
      subhead: "Too many agents burn out chasing leads and fighting admin. Legacy Financial & Life gives you mentorship, team support, and proven systems — so you spend your time with clients, not stuck behind a screen.",
    },
    cards: [
      { emoji: '🤝', title: 'People-First Culture', body: "A team that answers when you call. Mentors who remember what it was like starting out. Real support, not just a contract." },
      { emoji: '🕐', title: 'Full-Time or Part-Time', body: 'Whether you are full-time or part-time, our team helps set a practical schedule and support plan around your responsibilities.' },
      { emoji: '🛡️', title: 'Life, Health & Wealth', body: "Life insurance, health coverage, retirement planning — serve your clients across every financial milestone with full product access." },
    ],
    chatOpener: "Hey! 👋 Thanks for stopping by. I'd love to hear a little about you — what's your situation right now? What are you looking for in an opportunity?",
  },
};

// ── Variant C: Survey-driven dynamic content ───────────────────────

/**
 * Pain point categories that map to survey response values.
 * The variant C system aggregates recent survey results and picks
 * the top 3 pain points to emphasize in the messaging.
 */
export type PainPoint =
  | 'lead_gen'
  | 'admin_overload'
  | 'income_uncertainty'
  | 'no_mentorship'
  | 'captive_restrictions'
  | 'work_life_balance'
  | 'carrier_access'
  | 'compliance_burden';

interface PainPointContent {
  card: { emoji: string; title: string; body: string };
  heroAngle: string; // one-liner for headline mix
}

const PAIN_POINT_CONTENT: Record<PainPoint, PainPointContent> = {
  lead_gen: {
    card: { emoji: '🎯', title: 'Leads That Actually Convert', body: "Tired of buying garbage leads? Our system pre-qualifies prospects and puts warm conversations on your calendar." },
    heroAngle: 'finding clients',
  },
  admin_overload: {
    card: { emoji: '📋', title: 'Ditch the Paperwork', body: "Our support team handles compliance filings, follow-up sequences, and CRM updates so you never lose an hour to admin." },
    heroAngle: 'fighting paperwork',
  },
  income_uncertainty: {
    card: { emoji: '💰', title: 'Competitive Commission Support', body: 'With a steady pipeline and competitive commission support through the alliance, you can plan your production with greater confidence.' },
    heroAngle: 'inconsistent income',
  },
  no_mentorship: {
    card: { emoji: '👨‍🏫', title: 'Mentorship That Delivers', body: "Weekly 1-on-1 calls with agents who've closed 300+ policies. Real coaching, not a YouTube playlist." },
    heroAngle: 'learning alone',
  },
  captive_restrictions: {
    card: { emoji: '🔓', title: 'Freedom to Sell What Fits', body: "Access 40+ carriers through Alliance FMO. Recommend what's best for the client — Life, Health, or Wealth products — without captive restrictions." },
    heroAngle: 'carrier restrictions',
  },
  work_life_balance: {
    card: { emoji: '⏰', title: 'Work Stays at Work', body: "Systems handle evenings and weekends — follow-ups fire, leads nurture, and you spend time with family." },
    heroAngle: 'burnout',
  },
  carrier_access: {
    card: { emoji: '📈', title: 'Top-Level Contracts', body: "Alliance FMO gets you the same commission levels as agencies 10x your size. Full access across Life, Health, and Wealth products." },
    heroAngle: 'limited carrier access',
  },
  compliance_burden: {
    card: { emoji: '✅', title: 'Compliance Handled', body: "CE tracking, state filings, appointment renewals — our team manages the regulatory maze so you never miss a deadline." },
    heroAngle: 'compliance headaches',
  },
};

// Default pain point order if no survey data is available
const DEFAULT_PAIN_POINTS: PainPoint[] = ['lead_gen', 'admin_overload', 'no_mentorship'];

/**
 * Build variant C content from aggregated survey pain point rankings.
 * topPainPoints should be the top 3 most commonly reported pain points.
 */
export function buildSurveyDrivenContent(
  tier: ProspectTier,
  topPainPoints: PainPoint[],
): VariantContent {
  const points = topPainPoints.length >= 3
    ? topPainPoints.slice(0, 3)
    : [...topPainPoints, ...DEFAULT_PAIN_POINTS.filter(p => !topPainPoints.includes(p))].slice(0, 3);

  const angles = points.map(p => PAIN_POINT_CONTENT[p].heroAngle);
  const cards = points.map(p => PAIN_POINT_CONTENT[p].card);

  // Dynamic headline based on top pain point + tier
  let headline: string;
  let subhead: string;

  if (tier === 'established') {
    headline = `Tired of ${angles[0]}? There's a Better Way.`;
    subhead = `You got into this business to help families — not to spend your week on ${angles.slice(0, 2).join(' and ')}. Legacy Financial & Life fixes that with a support team, proven systems, and direct carrier access.`;
  } else if (tier === 'new') {
    headline = `New to Insurance? Skip the ${angles[0]} Phase.`;
    subhead = `Most new agents struggle with ${angles.slice(0, 2).join(', ')} and ${angles[2]}. At Legacy Financial & Life, we've already solved those problems so you can focus on clients from day one.`;
  } else {
    headline = `Stop Struggling With ${angles[0].charAt(0).toUpperCase() + angles[0].slice(1)}`;
    subhead = `${angles[0].charAt(0).toUpperCase() + angles[0].slice(1)}, ${angles[1]}, ${angles[2]} — the stuff that burns agents out. Legacy Financial & Life handles it for you with team support, mentorship, and real systems that work.`;
  }

  const chatOpener = tier === 'established'
    ? `Hey! 👋 A lot of agents tell us ${angles[0]} is their biggest frustration. Is that true for you too, or is something else eating your time?`
    : tier === 'new'
    ? `Hey! 👋 We hear from a lot of new agents that ${angles[0]} is the hardest part. What's been your experience so far?`
    : `Hey! 👋 We've been hearing that ${angles[0]} is a huge challenge for agents right now. Is that resonating with you?`;

  return { hero: { headline, subhead }, cards, chatOpener };
}

// ─── Variant assignment ────────────────────────────────────────────

export const VARIANT_COOKIE = 'lfl_join_variant';
const VARIANT_OPTIONS: JoinVariant[] = ['A', 'B', 'C'];

// Default weights: 34% A, 33% B, 33% C
const DEFAULT_WEIGHTS: Record<JoinVariant, number> = { A: 34, B: 33, C: 33 };

/**
 * Parse weights from env var. Format: "A:40,B:30,C:30"
 */
function parseWeights(raw?: string): Record<JoinVariant, number> {
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    const result: Record<string, number> = {};
    for (const part of raw.split(',')) {
      const [k, v] = part.split(':');
      if (k && v && VARIANT_OPTIONS.includes(k.trim() as JoinVariant)) {
        result[k.trim()] = parseInt(v.trim(), 10);
      }
    }
    if (Object.keys(result).length === 3) return result as Record<JoinVariant, number>;
  } catch { /* fall through */ }
  return DEFAULT_WEIGHTS;
}

/**
 * Assign a variant based on configured weights.
 */
function weightedRandomVariant(weights: Record<JoinVariant, number>): JoinVariant {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (const v of VARIANT_OPTIONS) {
    rand -= weights[v];
    if (rand <= 0) return v;
  }
  return 'A';
}

/**
 * Resolve variant from cookie or assign a new one.
 * Returns [variant, isNew] — isNew = true means we need to set the cookie.
 */
export function resolveVariant(
  cookieHeader: string | null,
  envWeights?: string,
  forceVariant?: string | null,
): [JoinVariant, boolean] {
  // Force override via query param (for testing: ?variant=B)
  if (forceVariant && VARIANT_OPTIONS.includes(forceVariant as JoinVariant)) {
    return [forceVariant as JoinVariant, true];
  }

  // Check existing cookie
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`${VARIANT_COOKIE}=([ABC])`));
    if (match) return [match[1] as JoinVariant, false];
  }

  // New assignment
  const weights = parseWeights(envWeights);
  return [weightedRandomVariant(weights), true];
}

/**
 * Get content for the resolved variant.
 */
export function getVariantContent(
  variant: JoinVariant,
  tier: ProspectTier,
  surveyPainPoints?: PainPoint[],
): VariantContent {
  switch (variant) {
    case 'A': return VARIANT_A[tier];
    case 'B': return VARIANT_B[tier];
    case 'C': return buildSurveyDrivenContent(tier, surveyPainPoints || DEFAULT_PAIN_POINTS);
  }
}

// ─── Survey aggregation helper ─────────────────────────────────────

/**
 * Fetch top pain points from recent survey responses.
 * Queries the survey_responses table for answers matching pain point values.
 * Returns sorted pain points by frequency.
 */
export async function fetchTopPainPoints(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<PainPoint[]> {
  try {
    // Fetch all responses where answer_value matches known pain point keys
    // from the last 90 days
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const res = await fetch(
      `${supabaseUrl}/rest/v1/survey_responses?answered_at=gte.${encodeURIComponent(cutoff)}&select=answer_value`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!res.ok) return DEFAULT_PAIN_POINTS;
    const rows: Array<{ answer_value: string }> = await res.json();

    // Count occurrences of known pain point values
    const validPoints = new Set<string>(Object.keys(PAIN_POINT_CONTENT));
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const val = row.answer_value?.toLowerCase().replace(/\s+/g, '_');
      if (val && validPoints.has(val)) {
        counts[val] = (counts[val] || 0) + 1;
      }
    }

    if (Object.keys(counts).length === 0) return DEFAULT_PAIN_POINTS;

    // Sort by frequency descending
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k as PainPoint);

    return sorted.length >= 3 ? sorted.slice(0, 5) : [...sorted, ...DEFAULT_PAIN_POINTS.filter(p => !sorted.includes(p))].slice(0, 5);
  } catch {
    return DEFAULT_PAIN_POINTS;
  }
}
