import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

const LIMIT = 150;
const PAID_STATUSES = ["paid", "fulfilling", "delivered", "awaiting_manual_fulfillment"];
const PROBLEM_STATUSES = ["failed", "needs_reconciliation", "refunded", "cancelled"];

// Every incoming-money event the admin cares about, in one list:
//  - wallet_topup  : deposits made from the wallet page (credited, or the
//                    generated-but-unpaid invoices: pending / expired)
//  - onchain_order : products paid directly with USDT BEP20 (with tx hash,
//                    plus orders still awaiting payment in the last 24h)
//  - adjustment    : manual credits/debits made by an admin
// Runs only when the tab is opened or refreshed.
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [topupsRes, invoicesRes, paidOrdersRes, pendingOrdersRes, adjRes] = await Promise.all([
    supabaseAdmin
      .from("wallet_topups")
      .select("id, user_id, tx_hash, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("wallet_deposit_invoices")
      .select("id, user_id, requested_amount, unique_amount, status, tx_hash, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("orders")
      .select("id, user_id, order_number, total, expected_amount, status, tx_hash, created_at, products(title)")
      .eq("paid_with", "onchain")
      .not("tx_hash", "is", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("orders")
      .select("id, user_id, order_number, total, expected_amount, status, tx_hash, created_at, products(title)")
      .eq("paid_with", "onchain")
      .eq("status", "pending_payment")
      .is("tx_hash", null)
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("wallet_adjustments")
      .select("id, user_id, amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  for (const r of [topupsRes, invoicesRes, paidOrdersRes, pendingOrdersRes, adjRes]) {
    if (r.error) return res.status(500).json({ success: false, error: r.error.message });
  }

  const topups = topupsRes.data || [];
  const invoices = invoicesRes.data || [];
  const paidOrders = paidOrdersRes.data || [];
  const pendingOrders = pendingOrdersRes.data || [];
  const adjustments = adjRes.data || [];

  const userIds = [
    ...new Set(
      [...topups, ...invoices, ...paidOrders, ...pendingOrders, ...adjustments].map((r) => r.user_id)
    ),
  ];
  const emails = new Map();
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    for (const p of profiles || []) emails.set(p.id, p.email);
  }
  const emailOf = (id) => emails.get(id) || "unknown";

  // Exact on-chain amount for a credited top-up = its matched invoice.
  const invoiceByTx = new Map();
  for (const inv of invoices) if (inv.tx_hash) invoiceByTx.set(inv.tx_hash.toLowerCase(), inv);

  const now = Date.now();
  const rows = [];

  for (const t of topups) {
    rows.push({
      id: `t-${t.id}`,
      source: "wallet_topup",
      state: t.status === "credited" ? "confirmed" : "problem",
      label: t.status === "credited" ? "Credited" : t.status,
      email: emailOf(t.user_id),
      amount: Number(t.amount),
      exact: invoiceByTx.get(String(t.tx_hash).toLowerCase())?.unique_amount ?? null,
      note: "Wallet top-up",
      tx_hash: t.tx_hash,
      created_at: t.created_at,
    });
  }

  for (const i of invoices) {
    if (i.status === "matched") continue; // already shown as a credited top-up
    const expired =
      i.status === "expired" ||
      i.status === "cancelled" ||
      (i.status === "pending" && new Date(i.expires_at).getTime() < now);
    rows.push({
      id: `i-${i.id}`,
      source: "wallet_topup",
      state: expired ? "expired" : "pending",
      label: expired ? "Expired" : "Awaiting payment",
      email: emailOf(i.user_id),
      amount: Number(i.requested_amount),
      exact: Number(i.unique_amount),
      note: "Wallet top-up (not paid)",
      tx_hash: null,
      created_at: i.created_at,
    });
  }

  for (const o of [...paidOrders, ...pendingOrders]) {
    let state = "pending";
    let label = "Awaiting payment";
    if (o.tx_hash) {
      if (PAID_STATUSES.includes(o.status)) {
        state = "confirmed";
        label = "Paid";
      } else if (PROBLEM_STATUSES.includes(o.status)) {
        state = "problem";
        label = o.status.replaceAll("_", " ");
      } else {
        label = "Verifying";
      }
    }
    rows.push({
      id: `o-${o.id}`,
      source: "onchain_order",
      state,
      label,
      email: emailOf(o.user_id),
      amount: Number(o.total),
      exact: Number(o.expected_amount),
      note: `Order #${o.order_number} · ${o.products?.title || "product"}`,
      tx_hash: o.tx_hash,
      created_at: o.created_at,
    });
  }

  for (const a of adjustments) {
    const amt = Number(a.amount);
    rows.push({
      id: `a-${a.id}`,
      source: "adjustment",
      state: "confirmed",
      label: amt >= 0 ? "Admin credit" : "Admin debit",
      email: emailOf(a.user_id),
      amount: amt,
      exact: null,
      note: a.reason,
      tx_hash: null,
      created_at: a.created_at,
    });
  }

  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const since = now - 24 * 60 * 60 * 1000;
  const recent = (src) =>
    rows.filter(
      (r) => r.source === src && r.state === "confirmed" && new Date(r.created_at).getTime() >= since
    );
  const sum = (list) => Number(list.reduce((s, r) => s + r.amount, 0).toFixed(2));
  const topup24 = recent("wallet_topup");
  const order24 = recent("onchain_order");

  return res.status(200).json({
    success: true,
    rows,
    summary: {
      topup24Count: topup24.length,
      topup24Amount: sum(topup24),
      order24Count: order24.length,
      order24Amount: sum(order24),
      pending: rows.filter((r) => r.state === "pending").length,
    },
  });
}
