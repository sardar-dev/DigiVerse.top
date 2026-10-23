import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

// Admin statistics. Only runs when the admin opens/refreshes the Stats
// tab (no polling, no cron), and keeps work small: cheap head-only
// COUNT queries for totals, plus ONE capped orders query that is
// aggregated in JS. All queries run in parallel.
const ORDER_ROW_CAP = 10000;
const RECENT_USERS = 15;

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const count = (table, apply) => {
    let q = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
    if (apply) q = apply(q);
    return q;
  };

  const [
    users,
    users7,
    users30,
    productsAll,
    productsLive,
    productsManual,
    invoicesPending,
    adjustments,
    orders,
    topups,
    recentUsers,
    balances,
    market,
  ] = await Promise.all([
    count("profiles"),
    count("profiles", (q) => q.gte("created_at", since7)),
    count("profiles", (q) => q.gte("created_at", since30)),
    count("products"),
    count("products", (q) => q.eq("selected", true).gt("available_stock", 0)),
    count("products", (q) => q.eq("provider", "manual")),
    count("wallet_deposit_invoices", (q) => q.eq("status", "pending")),
    count("wallet_adjustments"),
    supabaseAdmin
      .from("orders")
      .select("status, total, quantity, paid_with, created_at, user_id, product_id, unit_cost, products(title, cost_price)")
      .order("created_at", { ascending: false })
      .limit(ORDER_ROW_CAP),
    supabaseAdmin.from("wallet_topups").select("amount, status, created_at").limit(ORDER_ROW_CAP),
    supabaseAdmin
      .from("profiles")
      .select("email, balance, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_USERS),
    supabaseAdmin.from("profiles").select("balance").gt("balance", 0).limit(ORDER_ROW_CAP),
    // Supplier-side movers: biggest stock drops first (migration 020).
    supabaseAdmin
      .from("product_sources")
      .select("supplier, supplier_title, product_id, cost, stock, stock_drops, stock_ups, drops_since, products(title, selected, sell_price)")
      .gt("stock_drops", 0)
      .order("stock_drops", { ascending: false })
      .limit(15),
  ]);

  let ordersRes = orders;
  if (orders.error && /unit_cost/i.test(orders.error.message)) {
    ordersRes = await supabaseAdmin
      .from("orders")
      .select("status, total, quantity, paid_with, created_at, user_id, product_id, products(title, cost_price)")
      .order("created_at", { ascending: false })
      .limit(ORDER_ROW_CAP);
  }
  const orderRows = ordersRes.data || [];
  const byStatus = {};
  const byMethod = { onchain: 0, wallet_balance: 0 };
  const topProducts = new Map();
  const buyers = new Set();
  const daily = new Map(); // last 14 days: orders + delivered revenue
  let delivered = 0;
  let revenue = 0;
  let revenue7 = 0;
  let revenue30 = 0;
  let profit = 0;
  let profit7 = 0;
  let profit30 = 0;
  let orders7 = 0;
  let orders30 = 0;
  const cutoff14 = Date.now() - 14 * 86400000;

  for (const o of orderRows) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.created_at >= since7) orders7++;
    if (o.created_at >= since30) orders30++;

    if (o.status === "delivered") {
      const t = Number(o.total) || 0;
      // Profit = what the customer paid minus what the supplier charged us.
      const cost = Number(o.unit_cost ?? o.products?.cost_price ?? 0) * (o.quantity || 0);
      const gain = t - cost;
      delivered++;
      revenue += t;
      profit += gain;
      if (o.created_at >= since7) {
        revenue7 += t;
        profit7 += gain;
      }
      if (o.created_at >= since30) {
        revenue30 += t;
        profit30 += gain;
      }
      buyers.add(o.user_id);
      byMethod[o.paid_with] = (byMethod[o.paid_with] || 0) + 1;

      const title = o.products?.title || `#${o.product_id}`;
      const cur = topProducts.get(o.product_id) || { title, units: 0, revenue: 0, profit: 0 };
      cur.units += o.quantity;
      cur.revenue += t;
      cur.profit += gain;
      topProducts.set(o.product_id, cur);
    }

    if (new Date(o.created_at).getTime() >= cutoff14) {
      const k = dayKey(o.created_at);
      const d = daily.get(k) || { date: k, orders: 0, revenue: 0 };
      d.orders++;
      if (o.status === "delivered") d.revenue += Number(o.total) || 0;
      daily.set(k, d);
    }
  }

  const topupRows = (topups.data || []).filter((t) => t.status === "credited");
  const topupTotal = topupRows.reduce((s, t) => s + Number(t.amount || 0), 0);
  const walletHeld = (balances.data || []).reduce((s, b) => s + Number(b.balance || 0), 0);
  const round = (n) => Number(n.toFixed(2));

  return res.status(200).json({
    success: true,
    generatedAt: new Date().toISOString(),
    truncated: orderRows.length >= ORDER_ROW_CAP,
    users: {
      total: users.count ?? 0,
      last7: users7.count ?? 0,
      last30: users30.count ?? 0,
      buyers: buyers.size,
      recent: recentUsers.data || [],
    },
    orders: {
      total: orderRows.length,
      last7: orders7,
      last30: orders30,
      delivered,
      byStatus,
      byMethod,
      avgOrderValue: delivered ? round(revenue / delivered) : 0,
      daily: Array.from(daily.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    },
    revenue: {
      total: round(revenue),
      last7: round(revenue7),
      last30: round(revenue30),
      profit: round(profit),
      profit7: round(profit7),
      profit30: round(profit30),
    },
    products: {
      total: productsAll.count ?? 0,
      live: productsLive.count ?? 0,
      manual: productsManual.count ?? 0,
      top: Array.from(topProducts.values())
        .sort((a, b) => b.units - a.units)
        .slice(0, 8)
        .map((p) => ({ ...p, revenue: round(p.revenue), profit: round(p.profit) })),
      // Supplier products whose stock fell the most between syncs.
      // null = migration 020 not run yet.
      market: market.error
        ? null
        : (market.data || []).map((m) => ({
            title: m.supplier_title || m.products?.title || `#${m.product_id}`,
            supplier: m.supplier,
            cost: Number(m.cost),
            stock: m.stock,
            drops: m.stock_drops,
            ups: m.stock_ups,
            since: m.drops_since,
            onStore: !!m.products?.selected,
            inCatalog: !!m.products,
          })),
    },
    wallet: {
      topups: topupRows.length,
      topupTotal: round(topupTotal),
      heldBalance: round(walletHeld),
      pendingInvoices: invoicesPending.count ?? 0,
      adjustments: adjustments.count ?? 0,
    },
  });
}
