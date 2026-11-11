import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { order_id, items } = req.body || {};
  if (!order_id || !items) {
    return res.status(400).json({ success: false, error: "order_id_and_items_required" });
  }

  const itemsArray = Array.isArray(items)
    ? items
    : String(items).split("\n").map((s) => s.trim()).filter(Boolean);

  if (itemsArray.length === 0) {
    return res.status(400).json({ success: false, error: "items_required" });
  }

  // Conditional update — only succeeds if the order is still
  // awaiting_manual_fulfillment, so a double-click (or two admins
  // delivering the same order at once) can't deliver it twice.
  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({
      status: "delivered",
      items: itemsArray,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order_id)
    .eq("status", "awaiting_manual_fulfillment")
    .select()
    .single();

  if (error || !data) {
    return res.status(409).json({ success: false, error: "order_not_awaiting_delivery" });
  }

  // Finalize referral gifts if applied to this order
  if (Number(data.gifts_redeemed || 0) > 0) {
    await supabaseAdmin.rpc("finalize_gift_redemption", {
      p_order_id: data.id,
      p_actual_cost: data.unit_cost ? Number(data.unit_cost) : null,
      p_is_estimated: true,
    });
  }

  return res.status(200).json({ success: true });
}
