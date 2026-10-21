import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

// POST { id } — refunds a FAILED order to the customer's wallet balance
// (same amount they paid) and marks the order "refunded".
// Safe against double clicks: the status flip failed -> refunded is one
// conditional UPDATE, so only one request can ever win it and credit.
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ success: false, error: "id_required" });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, total, status, paid_with, tx_hash, order_number")
    .eq("id", id)
    .maybeSingle();
  if (!order) return res.status(404).json({ success: false, error: "order_not_found" });
  if (order.status !== "failed") {
    return res.status(409).json({ success: false, error: `not_refundable_${order.status}` });
  }

  // Only refund money that was really taken: wallet payments are deducted
  // before delivery; on-chain payments need a CONFIRMED tx hash.
  if (order.paid_with !== "wallet_balance") {
    const { data: tx } = await supabaseAdmin
      .from("used_tx_hashes")
      .select("status")
      .eq("tx_hash", String(order.tx_hash || "").toLowerCase())
      .maybeSingle();
    if (!order.tx_hash || tx?.status !== "confirmed") {
      return res.status(409).json({ success: false, error: "no_confirmed_payment" });
    }
  }

  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: "invalid_amount" });
  }

  // Atomic claim: only one request flips failed -> refunded.
  const { data: claimed } = await supabaseAdmin
    .from("orders")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (!claimed) return res.status(409).json({ success: false, error: "already_processed" });

  const { data: newBalance, error: balErr } = await supabaseAdmin.rpc("increment_balance", {
    p_user_id: order.user_id,
    p_amount: amount,
  });
  if (balErr) {
    // Nothing was credited — put the order back so it can be retried.
    await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", order.id);
    return res.status(500).json({ success: false, error: balErr.message });
  }

  // Audit trail; shows in the customer's wallet history too.
  await supabaseAdmin.from("wallet_adjustments").insert({
    user_id: order.user_id,
    amount,
    reason: `Refund for order #${order.order_number}`,
    created_by: session.user.id,
  });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", order.user_id)
    .maybeSingle();

  return res.status(200).json({
    success: true,
    refunded: amount,
    balance: newBalance,
    email: profile?.email || null,
    order_number: order.order_number,
  });
}
