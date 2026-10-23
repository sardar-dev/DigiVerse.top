import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { getBalance } from "../../../lib/digitrust";
import * as xpro from "../../../lib/suppliers/xpro";

const LOW_BALANCE_THRESHOLD = Number(process.env.LOW_BALANCE_THRESHOLD || 5);

// Supplier wallet balances come from outside APIs, so they are remembered
// for a minute per server instance instead of being fetched on every
// admin page load. ?fresh=1 skips the memory.
let balanceMemo = { at: 0, value: null };

async function supplierBalances() {
  let digitrustBalance = null;
  let digitrustBalanceError = null;
  let xproInfo = null;
  await Promise.all([
    (async () => {
      try {
        const b = await getBalance();
        digitrustBalance = b.balance ?? b.wallet_balance ?? b;
      } catch (e) {
        digitrustBalanceError = e.message;
      }
    })(),
    (async () => {
      if (!xpro.configured()) return;
      xproInfo = { balance: null, error: null, low: false };
      try {
        xproInfo.balance = (await xpro.getBalance()).balance;
        xproInfo.low = xproInfo.balance !== null && xproInfo.balance < LOW_BALANCE_THRESHOLD;
      } catch (e) {
        xproInfo.error = e.message;
      }
    })(),
  ]);
  return {
    digitrust: {
      balance: digitrustBalance,
      error: digitrustBalanceError,
      low: digitrustBalance !== null && digitrustBalance < LOW_BALANCE_THRESHOLD,
      threshold: LOW_BALANCE_THRESHOLD,
    },
    xpro: xproInfo,
  };
}

// One database call that adds everything up (migration 021). Older setups
// fall back to reading the rows, as before.
async function summary() {
  const { data, error } = await supabaseAdmin.rpc("admin_dashboard_summary");
  if (!error && data) {
    return {
      delivered: Number(data.delivered) || 0,
      sales: Number(data.sales) || 0,
      cost: Number(data.cost) || 0,
      openTickets: Number(data.open_tickets) || 0,
      pendingWithdrawals: Number(data.pending_withdrawals) || 0,
    };
  }

  let { data: delivered, error: deliveredErr } = await supabaseAdmin
    .from("orders")
    .select("total, quantity, product_id, unit_cost, products(cost_price)")
    .eq("status", "delivered");
  if (deliveredErr) {
    ({ data: delivered } = await supabaseAdmin
      .from("orders")
      .select("total, quantity, product_id, products(cost_price)")
      .eq("status", "delivered"));
  }
  let sales = 0;
  let cost = 0;
  for (const o of delivered || []) {
    sales += Number(o.total);
    cost += Number(o.unit_cost ?? o.products?.cost_price ?? 0) * o.quantity;
  }
  let openTickets = 0;
  try {
    const { count } = await supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    openTickets = count || 0;
  } catch {}
  return { delivered: (delivered || []).length, sales, cost, openTickets, pendingWithdrawals: 0 };
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  const fresh = req.query.fresh === "1";
  const balancesPromise =
    !fresh && balanceMemo.value && Date.now() - balanceMemo.at < 60_000
      ? Promise.resolve(balanceMemo.value)
      : supplierBalances().then((v) => {
          balanceMemo = { at: Date.now(), value: v };
          return v;
        });

  const [balances, sum, { data: meta }] = await Promise.all([
    balancesPromise,
    summary(),
    supabaseAdmin.from("app_meta").select("value").eq("key", "last_sync").maybeSingle(),
  ]);

  return res.status(200).json({
    success: true,
    openTickets: sum.openTickets,
    pendingWithdrawals: sum.pendingWithdrawals,
    digitrust: balances.digitrust,
    xpro: balances.xpro,
    lastSync: meta?.value || null,
    sales: {
      ordersDelivered: sum.delivered,
      totalSales: Number(sum.sales.toFixed(2)),
      totalCost: Number(sum.cost.toFixed(2)),
      profit: Number((sum.sales - sum.cost).toFixed(2)),
    },
  });
}
