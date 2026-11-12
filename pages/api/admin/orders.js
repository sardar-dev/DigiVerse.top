import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { supplierLabels } from "../../../lib/suppliers";
import { settleAllBuffOrders, placeBuffOrder, settleBuffOrder } from "../../../lib/tunvnBuff";
import { cleanupExpiredPendingOrders } from "../../../lib/orderCleanup";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    // Purge expired unpaid orders (>30 mins) completely from database
    await cleanupExpiredPendingOrders().catch(() => {});

    // Settle any fulfilling TunVN buff orders in the background
    settleAllBuffOrders(10).catch(() => {});

    let { data, error } = await supabaseAdmin
      .from("orders")
      .select("*, products(title, tunvn_buff)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error && /tunvn_buff/i.test(error.message)) {
      ({ data, error } = await supabaseAdmin
        .from("orders")
        .select("*, products(title)")
        .order("created_at", { ascending: false })
        .limit(200));
    }
    if (error) return res.status(500).json({ success: false, error: error.message });

    const now = Date.now();
    data = (data || []).filter(
      (o) => o.status !== "pending_payment" || (now - new Date(o.created_at).getTime() < 30 * 60 * 1000)
    );

    // Which account placed each order (orders link to auth users, not
    // profiles, so look the emails up in one extra query).
    const userIds = [...new Set((data || []).map((o) => o.user_id))];
    const emails = new Map();
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      for (const p of profiles || []) emails.set(p.id, p.email);
    }
    const sup = await supplierLabels();
    const orders = (data || []).map((o) => ({
      ...o,
      user_email: emails.get(o.user_id) || null,
      supplier_label: o.supplier ? sup[o.supplier]?.label || o.supplier : null,
      can_retry: Boolean(o.supplier && sup[o.supplier]?.idempotent),
      is_buff: Boolean(o.products?.tunvn_buff || o.supplier === "tunvn"),
    }));
    return res.status(200).json({ success: true, orders });
  }

  if (req.method === "POST") {
    const { id, status, items, digitrust_order_id, action } = req.body || {};

    if (action === "retry_buff" && id) {
      const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return res.status(404).json({ success: false, error: "order_not_found" });
      const result = await placeBuffOrder(order);
      if (result.placed) {
        return res.status(200).json({ success: true, message: "Order placed on TunVN" });
      }
      return res.status(400).json({ success: false, error: result.reason || "buff_order_failed" });
    }

    if (action === "settle_buff" && id) {
      const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return res.status(404).json({ success: false, error: "order_not_found" });
      const result = await settleBuffOrder(order);
      return res.status(200).json({ success: true, state: result.state });
    }

    // Body: { id, status, items?, digitrust_order_id? } — manual
    // override, e.g. marking a failed order "refunded" once you've
    // sent funds back by hand, cancelling a stuck order, or resolving
    // a "needs_reconciliation" order after checking DigiTrust's own
    // order history (mark delivered with the actual items, or fail
    // it for a refund if it turns out nothing was purchased).
    const allowed = [
      "refunded",
      "failed",
      "delivered",
      "cancelled",
      "pending_payment",
    ];
    if (!id || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: "invalid_request" });
    }
    const patch = { status, updated_at: new Date().toISOString() };
    if (status === "delivered" && items) {
      patch.items = Array.isArray(items) ? items : String(items).split("\n").filter(Boolean);
    }
    if (digitrust_order_id) patch.digitrust_order_id = digitrust_order_id;

    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    // Body: { id } — permanently removes the order row. Use for
    // junk/duplicate/abandoned pending orders, not for anything with
    // real money attached (cancel/refund those instead so there's a
    // record).
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "id_required" });
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
