import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

// GET ?email= — one user's balance, deposits, orders and wallet history
// for support. Runs only when the admin presses Search; every list is
// capped, so the cost is a handful of small indexed queries.
export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const q = String(req.query.email || "").trim().toLowerCase();
  if (q.length < 3) return res.status(400).json({ success: false, error: "email_too_short" });

  // Exact match first; otherwise a short list of partial matches.
  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, balance, created_at")
    .ilike("email", q)
    .maybeSingle();
  if (!profile) {
    const { data: like } = await supabaseAdmin
      .from("profiles")
      .select("id, email, balance, created_at")
      .ilike("email", `%${q.replace(/[%_]/g, "")}%`)
      .limit(6);
    if (!like?.length) return res.status(200).json({ success: true, found: false });
    if (like.length > 1) {
      return res.status(200).json({ success: true, found: false, matches: like.map((u) => u.email) });
    }
    profile = like[0];
  }

  const uid = profile.id;
  const [orders, topups, adjustments, invoices] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, quantity, unit_price, total, status, paid_with, tx_hash, supplier, supplier_order_id, coupon_code, discount_amount, created_at, products(title)"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("wallet_topups")
      .select("amount, tx_hash, status, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("wallet_adjustments")
      .select("amount, reason, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("wallet_deposit_invoices")
      .select("requested_amount, status, created_at")
      .eq("user_id", uid)
      .in("status", ["pending"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Older databases may lack the supplier columns — retry without them.
  let orderRows = orders.data;
  if (orders.error) {
    const r = await supabaseAdmin
      .from("orders")
      .select("id, order_number, quantity, unit_price, total, status, paid_with, tx_hash, coupon_code, discount_amount, created_at, products(title)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    orderRows = r.data;
  }

  const good = (rows) => (rows || []).filter(Boolean);
  const ords = good(orderRows);
  const tops = good(topups.data).filter((t) => t.status === "credited");
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  return res.status(200).json({
    success: true,
    found: true,
    user: { email: profile.email, balance: Number(profile.balance || 0), joined: profile.created_at },
    totals: {
      deposited: Number(sum(tops, (t) => t.amount).toFixed(2)),
      spent: Number(sum(ords.filter((o) => o.status === "delivered"), (o) => o.total).toFixed(2)),
      refunded: Number(sum(ords.filter((o) => o.status === "refunded"), (o) => o.total).toFixed(2)),
      orders: ords.length,
    },
    orders: ords,
    deposits: tops,
    adjustments: good(adjustments.data),
    pendingInvoices: good(invoices.data),
  });
}
