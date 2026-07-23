import type { APIRoute } from 'astro';
import { verifySessionCookie } from '../../lib/ai-demo-auth';

export const prerender = false;

const SUPABASE_URL = import.meta.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const WALLETS_TABLE = 'apollo_credit_wallets';
const TRANSACTIONS_TABLE = 'apollo_credit_transactions';

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

type CreditTransaction = {
  amount: number;
  type: string;
  stage?: string | null;
  campaign_id: string | null;
};

async function buildUsageInsights(wallet: { lifetime_used?: number }, transactions: CreditTransaction[]) {
  const recentUsage = transactions.filter(tx => tx.amount < 0);
  const recentCreditsUsed = recentUsage.reduce((total, tx) => total + Math.abs(tx.amount), 0);
  const byStage = recentUsage.reduce<Record<string, number>>((totals, tx) => {
    const stage = tx.stage || tx.type || 'processing';
    totals[stage] = (totals[stage] || 0) + Math.abs(tx.amount);
    return totals;
  }, {});
  const campaignIds = [...new Set(recentUsage.map(tx => tx.campaign_id).filter(Boolean))] as string[];
  const campaignNames: Record<string, string> = {};
  const campaignReturns: Record<string, { return_count: number; realized_return_count: number; realized_value_cents: number }> = {};

  if (campaignIds.length > 0) {
    const ids = campaignIds.join(',');
    const [recruitmentRes, salesRes, returnsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/recruitment_campaigns?id=in.(${ids})&select=id,name`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/sales_campaigns?id=in.(${ids})&select=id,name`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/campaign_return_summary?campaign_id=in.(${ids})&select=campaign_id,return_count,realized_return_count,realized_value_cents`, { headers: supaHeaders() }),
    ]);
    for (const response of [recruitmentRes, salesRes]) {
      if (!response.ok) continue;
      const campaigns = await response.json();
      for (const campaign of campaigns) campaignNames[campaign.id] = campaign.name;
    }
    if (returnsRes.ok) {
      const returns = await returnsRes.json();
      for (const row of returns) {
        campaignReturns[row.campaign_id] = {
          return_count: Number(row.return_count) || 0,
          realized_return_count: Number(row.realized_return_count) || 0,
          realized_value_cents: Number(row.realized_value_cents) || 0,
        };
      }
    }
  }

  const campaignUsage = recentUsage.reduce<Record<string, { credits: number; transactions: number }>>((totals, tx) => {
    const id = tx.campaign_id || 'unattributed';
    if (!totals[id]) totals[id] = { credits: 0, transactions: 0 };
    totals[id].credits += Math.abs(tx.amount);
    totals[id].transactions += 1;
    return totals;
  }, {});

  return {
    unitPriceCents: 50,
    lifetimeModeledValueCents: (wallet.lifetime_used || 0) * 50,
    recentCreditsUsed,
    recentModeledValueCents: recentCreditsUsed * 50,
    byStage,
    campaigns: Object.entries(campaignUsage)
      .map(([id, usage]) => ({
        campaignId: id === 'unattributed' ? null : id,
        campaignName: campaignNames[id] || (id === 'unattributed' ? 'Unattributed platform activity' : 'Archived or unavailable campaign'),
        ...usage,
        observedReturns: campaignReturns[id]?.return_count || 0,
        realizedReturns: campaignReturns[id]?.realized_return_count || 0,
        realizedValueCents: campaignReturns[id]?.realized_value_cents || 0,
        modeledValueCents: usage.credits * 50,
      }))
      .sort((a, b) => b.credits - a.credits),
  };
}

/**
 * GET /api/apollo-credits — get wallet balance + recent transactions
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  try {
    // Get wallet
    const walletRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${WALLETS_TABLE}?client_slug=eq.legacy_financial&limit=1`,
      { headers: supaHeaders() }
    );
    if (!walletRes.ok) throw new Error(`Wallet fetch failed: ${walletRes.status}`);
    const wallets = await walletRes.json();

    if (wallets.length === 0) {
      return jsonRes({ wallet: null, transactions: [], message: 'Wallet system not initialized' });
    }

    const wallet = wallets[0];

    // Get recent transactions
    const txnRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${TRANSACTIONS_TABLE}?wallet_id=eq.${wallet.id}&order=created_at.desc&limit=50`,
      { headers: supaHeaders() }
    );
    const transactions = txnRes.ok ? await txnRes.json() : [];

    const insights = await buildUsageInsights(wallet, transactions);
    const enrichedTransactions = transactions.map((transaction: CreditTransaction & Record<string, unknown>) => ({
      ...transaction,
      campaign_name: transaction.campaign_id ? insights.campaigns.find(c => c.campaignId === transaction.campaign_id)?.campaignName || null : null,
    }));

    return jsonRes({ wallet, transactions: enrichedTransactions, insights });
  } catch (err) {
    console.error('apollo-credits GET error:', err);
    return jsonRes({ error: 'Failed to fetch wallet' }, 500);
  }
};

/**
 * POST /api/apollo-credits — deposit credits or adjust balance
 * Body: { action: 'deposit' | 'adjust', amount: number, reference?: string, description?: string }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await verifySessionCookie(request.headers.get('cookie'));
  if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonRes({ error: 'Database not configured' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action || 'deposit');
  const amount = Math.floor(Number(body.amount) || 0);
  const reference = String(body.reference || '').trim().slice(0, 500);
  const description = String(body.description || '').trim().slice(0, 500);

  if (amount <= 0) {
    return jsonRes({ error: 'Amount must be a positive integer' }, 400);
  }
  if (amount > 10000) {
    return jsonRes({ error: 'Maximum deposit is 10,000 credits' }, 400);
  }

  try {
    // Get current wallet
    const walletRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${WALLETS_TABLE}?client_slug=eq.legacy_financial&limit=1`,
      { headers: supaHeaders() }
    );
    if (!walletRes.ok) throw new Error(`Wallet fetch failed: ${walletRes.status}`);
    const [wallet] = await walletRes.json();

    if (!wallet) {
      return jsonRes({ error: 'Wallet not initialized. Run the migration first.' }, 404);
    }

    if (action === 'deposit') {
      const newBalance = wallet.balance + amount;

      // Update wallet
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${WALLETS_TABLE}?id=eq.${wallet.id}`,
        {
          method: 'PATCH',
          headers: { ...supaHeaders(), Prefer: 'return=representation' },
          body: JSON.stringify({
            balance: newBalance,
            lifetime_purchased: (wallet.lifetime_purchased || 0) + amount,
            zero_balance_paused_at: null, // clear pause flag
            updated_at: new Date().toISOString(),
          }),
        }
      );
      if (!updateRes.ok) throw new Error(`Update failed: ${updateRes.status}`);
      const [updatedWallet] = await updateRes.json();

      // Record transaction
      await fetch(
        `${SUPABASE_URL}/rest/v1/${TRANSACTIONS_TABLE}`,
        {
          method: 'POST',
          headers: { ...supaHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            wallet_id: wallet.id,
            type: 'deposit',
            amount: amount,
            balance_after: newBalance,
            description: description || `Manual deposit of ${amount} credits`,
            payment_reference: reference || null,
          }),
        }
      );

      return jsonRes({
        wallet: updatedWallet,
        resumed: [],
        message: `Added ${amount} credits. New balance: ${newBalance}. Campaign status is unchanged.`,
      });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('apollo-credits POST error:', err);
    return jsonRes({ error: 'Operation failed' }, 500);
  }
};
