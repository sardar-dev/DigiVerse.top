import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

// Admin statistics. Only runs when the admin opens/refreshes the Stats
// tab (no polling, no cron). Order/wallet totals are added up inside the
// database (admin_order_stats, migration 021) so only a few numbers cross
// the wire. Without that migration it falls back to reading the rows.
const ORDER_ROW_CAP = 10000;
const RECENT_USERS = 15;
const round = (n) => Number(Number(n || 0).toFixed(2));
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Same totals as the SQL function, computed from rows (fallback path).
async function statsFromRows(since7, since30) {
  const queryOrders = (cols) =>
    supabaseAdmin.from("orders").select(cols).order("created_at", { ascending: false }).limit(ORDER_ROW_CAP);
  let ordersRes = await queryOrders(
    "status, total, quantity, paid_with, created_at, user_id, product_id, unit_cost, products(title, cost_price)"
  );
  if (ordersRes.error && /unit_cost/i.test(ordersRes.error.message)) {
    ordersRes = await queryOrders("status, total, quantity, paid_with, created_at, user_id, product_id, products(title, cost_price)");
  }
  const [topups, balances] = await Promise.all([
    supabaseAdmin.from("wallet_topups").select("amount, status").eq("status", "credited").limit(ORDER_ROW_CAP),
    supabaseAdmin.from("profiles").select("balance").gt("balance", 0).limit(ORDER_ROW_CAP),
  ]);

  const rows = ordersRes.data || [];
  const out = {
    total: rows.length, last7: 0, last30: 0, delivered: 0, buyers: 0,
    by_status: {}, by_method: {}, sales: 0, profit: 0, sales7: 0, profit7: 0, sales30: 0, profit30: 0,
    daily: [], top: [], topups: (topups.data || []).length,
    topup_total: (topups.data || []).reduce((s, t) => s + Number(t.amount || 0), 0),
    held: (balances.data || []).reduce((s, b) => s + Number(b.balance || 0), 0),
    truncated: rows.length >= ORDER_ROW_CAP,
  };
  const buyers = new Set();
  const daily = new Map();
  const top = new Map();
  const cutoff14 = Date.now() - 14 * 86400000;
  for (const o of rows) {
    out.by_status[o.status] = (out.by_status[o.status] || 0) + 1;
    if (o.created_at >= since7) out.last7++;
    if (o.created_at >= since30) out.last30++;
    const delivered = o.status === "delivered";
    if (delivered) {
      const t = Number(o.total) || 0;
      const gain = t - Number(o.unit_cost ?? o.products?.cost_price ?? 0) * (o.quantity || 0);
      out.delivered++;
      out.sales += t;
      out.profit += gain;
      if (o.created_at >= since7) { out.sales7 += t; out.profit7 += gain; }
      if (o.created_at >= since30) { out.sales30 += t; out.profit30 += gain; }
      buyers.add(o.user_id);
      const m = o.paid_with || "onchain";
      out.by_method[m] = (out.by_method[m] || 0) + 1;
      const cur = top.get(o.product_id) || { title: o.products?.title || `#${o.product_id}`, units: 0, revenue: 0, profit: 0 };
      cur.units += o.quantity;
      cur.revenue += t;
      cur.profit += gain;
      top.set(o.product_id, cur);
    }
    if (new Date(o.created_at).getTime() >= cutoff14) {
      const k = dayKey(o.created_at);
      const d = daily.get(k) || { date: k, orders: 0, revenue: 0 };
      d.orders++;
      if (delivered) d.revenue += Number(o.total) || 0;
      daily.set(k, d);
    }
  }
  out.buyers = buyers.size;
  out.daily = Array.from(daily.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  out.top = Array.from(top.values()).sort((a, b) => b.units - a.units).slice(0, 8);
  return out;
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

  const [users, users7, users30, productsAll, productsLive, productsManual, invoicesPending, adjustments, recentUsers, market, rpc] =
    await Promise.all([
      count("profiles"),
      count("profiles", (q) => q.gte("created_at", since7)),
      count("profiles", (q) => q.gte("created_at", since30)),
      count("products"),
      count("products", (q) => q.eq("selected", true).gt("available_stock", 0)),
      count("products", (q) => q.eq("provider", "manual")),
      count("wallet_deposit_invoices", (q) => q.eq("status", "pending")),
      count("wallet_adjustments"),
      supabaseAdmin.from("profiles").select("email, balance, created_at").order("created_at", { ascending: false }).limit(RECENT_USERS),
      // Supplier-side movers: biggest stock drops first (migration 020).
      supabaseAdmin
        .from("product_sources")
        .select("supplier, supplier_title, product_id, cost, stock, stock_drops, stock_ups, drops_since, products(title, selected, sell_price)")
        .gt("stock_drops", 0)
        .order("stock_drops", { ascending: false })
        .limit(15),
      supabaseAdmin.rpc("admin_order_stats"),
    ]);

  const st = !rpc.error && rpc.data ? rpc.data : await statsFromRows(since7, since30);
  const delivered = Number(st.delivered) || 0;

  return res.status(200).json({
    success: true,
    generatedAt: new Date().toISOString(),
    truncated: Boolean(st.truncated),
    users: {
      total: users.count ?? 0,
      last7: users7.count ?? 0,
      last30: users30.count ?? 0,
      buyers: Number(st.buyers) || 0,
      recent: recentUsers.data || [],
    },
    orders: {
      total: Number(st.total) || 0,
      last7: Number(st.last7) || 0,
      last30: Number(st.last30) || 0,
      delivered,
      byStatus: st.by_status || {},
      byMethod: { onchain: 0, wallet_balance: 0, ...(st.by_method || {}) },
      avgOrderValue: delivered ? round(Number(st.sales) / delivered) : 0,
      daily: (st.daily || []).map((d) => ({ date: d.date, orders: Number(d.orders), revenue: Number(d.revenue) })),
    },
    revenue: {
      total: round(st.sales),
      last7: round(st.sales7),
      last30: round(st.sales30),
      profit: round(st.profit),
      profit7: round(st.profit7),
      profit30: round(st.profit30),
    },
    products: {
      total: productsAll.count ?? 0,
      live: productsLive.count ?? 0,
      manual: productsManual.count ?? 0,
      top: (st.top || []).map((p) => ({
        title: p.title,
        units: Number(p.units),
        revenue: round(p.revenue),
        profit: round(p.profit),
      })),
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
      topups: Number(st.topups) || 0,
      topupTotal: round(st.topup_total),
      heldBalance: round(st.held),
      pendingInvoices: invoicesPending.count ?? 0,
      adjustments: adjustments.count ?? 0,
    },
  });
}
