import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fulfillOrder } from "../../../lib/fulfillOrder";
import * as tunvn from "../../../lib/suppliers/tunvn";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  if (!session) {
    return res.status(401).json({ success: false, error: "login_required" });
  }

  const { order_id } = req.body || {};
  if (!order_id) {
    return res.status(400).json({ success: false, error: "order_id_required" });
  }

  // Atomically claim the order: only succeeds if it's still
  // pending_payment, so a double-click / parallel request can't pay
  // for (and deduct balance for) the same order twice.
  const { data: claimedOrder, error: claimErr } = await supabaseAdmin
    .from("orders")
    .update({ status: "paid", paid_with: "wallet_balance", updated_at: new Date().toISOString() })
    .eq("id", order_id)
    .eq("user_id", session.user.id)
    .eq("status", "pending_payment")
    .select()
    .single();

  if (claimErr || !claimedOrder) {
    return res.status(409).json({ success: false, error: "order_not_available" });
  }

  // TunVN buff check: ensure supplier API balance is sufficient BEFORE deducting customer's wallet!
  const { data: prod } = await supabaseAdmin
    .from("products")
    .select("tunvn_buff, cost_price")
    .eq("id", claimedOrder.product_id)
    .maybeSingle();

  if (prod?.tunvn_buff) {
    let tunvnBal = null;
    try {
      const balRes = await tunvn.getBalance();
      tunvnBal = balRes?.balance;
    } catch (e) {
      console.warn("[pay-with-balance] tunvn balance check failed:", e?.message);
    }
    const bal = Number.isFinite(tunvnBal) ? Math.max(0, tunvnBal) : 0;
    const unitCost = Number(prod.cost_price) > 0 ? Number(prod.cost_price) : 0.06;
    const maxAffordable = Math.floor(bal / unitCost);
    const reqQty = Number(claimedOrder.quantity) || 1;

    if (maxAffordable < reqQty) {
      // Revert order back to pending_payment without touching user's wallet balance!
      await supabaseAdmin
        .from("orders")
        .update({ status: "pending_payment", updated_at: new Date().toISOString() })
        .eq("id", order_id);

      return res.status(409).json({
        success: false,
        error: "supplier_balance_limit",
        max_qty: maxAffordable,
        message: maxAffordable > 0
          ? `You can order up to ${maxAffordable}B tokens right now. Please lower your quantity.`
          : `This product is temporarily unavailable. Please try again later.`,
      });
    }
  }

  // Atomic, single-statement balance deduction — `decrement_balance_
  // if_enough` does `balance = balance - x WHERE balance >= x` as one
  // Postgres UPDATE, so two simultaneous purchases can never both
  // succeed against a balance that only covers one of them.
  const { data: newBalance, error: balErr } = await supabaseAdmin.rpc(
    "decrement_balance_if_enough",
    { p_user_id: session.user.id, p_amount: claimedOrder.total }
  );

  if (balErr) {
    // Something went wrong before any money moved — safe to put the
    // order back for a retry.
    await supabaseAdmin
      .from("orders")
      .update({ status: "pending_payment", updated_at: new Date().toISOString() })
      .eq("id", order_id);
    return res.status(500).json({ success: false, error: balErr.message });
  }

  if (newBalance === null) {
    // The WHERE balance >= amount clause matched no row — insufficient funds.
    await supabaseAdmin
      .from("orders")
      .update({ status: "pending_payment", updated_at: new Date().toISOString() })
      .eq("id", order_id);
    return res.status(402).json({ success: false, error: "insufficient_balance" });
  }

  let result;
  try {
    result = await fulfillOrder(claimedOrder);
  } catch (e) {
    console.error("[pay-with-balance] fulfillOrder threw:", e?.message);
    // Unexpected crash — refund the balance immediately so user isn't stuck
    try {
      await supabaseAdmin.rpc("increment_balance", {
        p_user_id: session.user.id,
        p_amount: claimedOrder.total,
      });
    } catch (refundErr) {
      console.error("[pay-with-balance] auto-refund failed:", refundErr?.message);
    }
    await supabaseAdmin
      .from("orders")
      .update({ status: "failed", failure_reason: "fulfillment_crashed: " + (e?.message || "unknown"), updated_at: new Date().toISOString() })
      .eq("id", claimedOrder.id);
    return res.status(500).json({ success: false, error: "fulfillment_failed_please_contact_support" });
  }
  if (!result.success) {
    // fulfillOrder itself returned failure — check if it's a refundable failure
    const refundableErrors = ["out_of_stock_refund_pending", "fulfillment_failed_refund_pending"];
    if (refundableErrors.includes(result.error)) {
      try {
        await supabaseAdmin.rpc("increment_balance", {
          p_user_id: session.user.id,
          p_amount: claimedOrder.total,
        });
        await supabaseAdmin
          .from("orders")
          .update({ status: "refunded", updated_at: new Date().toISOString() })
          .eq("id", claimedOrder.id);
        return res.status(409).json({ success: false, error: result.error + "_refunded" });
      } catch (refundErr) {
        console.error("[pay-with-balance] refund on failure failed:", refundErr?.message);
      }
    }
    return res.status(502).json({ success: false, error: result.error });
  }
  return res.status(200).json({ success: true, items: result.items, manual: result.manual || false });
}
