import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { getBalance } from "../../../lib/digitrust";
import * as xpro from "../../../lib/suppliers/xpro";
import * as emstore from "../../../lib/suppliers/emstore";
import * as shotix from "../../../lib/suppliers/shotix";
import * as tunvn from "../../../lib/suppliers/tunvn";

const LOW_BALANCE_THRESHOLD = Number(process.env.LOW_BALANCE_THRESHOLD || 5);
const BALANCE_CACHE_TTL_MS = 120_000;

// Supplier wallet balances come from outside APIs, so they are cached
// both in memory AND in app_meta (120s TTL) to survive Vercel cold starts
// without hitting 5 external supplier APIs on every cold invocation.
// ?fresh=1 bypasses the cache.
let balanceMemo = { at: 0, value: null };

async function supplierBalances() {
  let digitrustBalance = null;
  let digitrustBalanceError = null;
  let xproInfo = null;
  let emstoreInfo = null;
  let shotixInfo = null;
  let tunvnInfo = null;
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
    (async () => {
      if (!emstore.configured()) return;
      emstoreInfo = { balance: null, error: null, low: false };
      try {
        emstoreInfo.balance = (await emstore.getBalance()).balance;
        emstoreInfo.low = emstoreInfo.balance !== null && emstoreInfo.balance < LOW_BALANCE_THRESHOLD;
      } catch (e) {
        emstoreInfo.error = e.message;
      }
    })(),
    (async () => {
      if (!shotix.configured()) return;
      shotixInfo = { balance: null, error: null, low: false };
      try {
        shotixInfo.balance = (await shotix.getBalance()).balance;
        shotixInfo.low = shotixInfo.balance !== null && shotixInfo.balance < LOW_BALANCE_THRESHOLD;
      } catch (e) {
        shotixInfo.error = e.message;
      }
    })(),
    (async () => {
      if (!tunvn.configured()) return;
      tunvnInfo = { balance: null, error: null, low: false };
      try {
        tunvnInfo.balance = (await tunvn.getBalance()).balance;
        tunvnInfo.low = tunvnInfo.balance !== null && tunvnInfo.balance < LOW_BALANCE_THRESHOLD;
      } catch (e) {
        tunvnInfo.error = e.message;
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
    emstore: emstoreInfo,
    shotix: shotixInfo,
    tunvn: tunvnInfo,
  };
}

// One database call that adds everything up (migration 021). Older setups
// fall back to reading the rows, as before.
async function summary() {
  const [rpcRes, manualRes] = await Promise.all([
    supabaseAdmin.rpc("admin_dashboard_summary"),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_manual_fulfillment"),
  ]);
  const pendingManual = manualRes.count || 0;

  if (!rpcRes.error && rpcRes.data) {
    const data = rpcRes.data;
    return {
      delivered: Number(data.delivered) || 0,
      sales: Number(data.sales) || 0,
      cost: Number(data.cost) || 0,
      openTickets: Number(data.open_tickets) || 0,
      pendingWithdrawals: Number(data.pending_withdrawals) || 0,
      pendingManual,
    };
  }

  let { data: delivered, error: deliveredErr } = await supabaseAdmin
    .from("orders")
    .select("total, quantity, product_id, unit_cost, products(cost_price)")
    .in("status", ["delivered", "completed"]);
  if (deliveredErr) {
    ({ data: delivered } = await supabaseAdmin
      .from("orders")
      .select("total, quantity, product_id, products(cost_price)")
      .in("status", ["delivered", "completed"]));
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
  return { delivered: (delivered || []).length, sales, cost, openTickets, pendingWithdrawals: 0, pendingManual };
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  const fresh = req.query.fresh === "1";

  const [sum, { data: metaRows }] = await Promise.all([
    summary(),
    supabaseAdmin
      .from("app_meta")
      .select("key, value")
      .in("key", ["last_sync", "supplier_balances_cache"]),
  ]);

  const metaMap = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));
  let dbCache = null;
  if (metaMap.supplier_balances_cache) {
    try {
      dbCache = JSON.parse(metaMap.supplier_balances_cache);
    } catch {}
  }

  let balances;
  if (!fresh && balanceMemo.value && Date.now() - balanceMemo.at < 60_000) {
    balances = balanceMemo.value;
  } else if (!fresh && dbCache?.value && Date.now() - Number(dbCache.at || 0) < BALANCE_CACHE_TTL_MS) {
    balances = dbCache.value;
    balanceMemo = { at: Number(dbCache.at), value: balances };
  } else {
    balances = await supplierBalances();
    const nowMs = Date.now();
    balanceMemo = { at: nowMs, value: balances };
    try {
      await supabaseAdmin.from("app_meta").upsert({
        key: "supplier_balances_cache",
        value: JSON.stringify({ at: nowMs, value: balances }),
        updated_at: new Date(nowMs).toISOString(),
      });
    } catch {}
  }

  return res.status(200).json({
    success: true,
    openTickets: sum.openTickets,
    pendingWithdrawals: sum.pendingWithdrawals,
    pendingManual: sum.pendingManual,
    digitrust: balances.digitrust,
    xpro: balances.xpro,
    emstore: balances.emstore,
    shotix: balances.shotix,
    tunvn: balances.tunvn,
    lastSync: metaMap.last_sync || null,
    sales: {
      ordersDelivered: sum.delivered,
      totalSales: Number(sum.sales.toFixed(2)),
      totalCost: Number(sum.cost.toFixed(2)),
      profit: Number((sum.sales - sum.cost).toFixed(2)),
    },
  });
}
