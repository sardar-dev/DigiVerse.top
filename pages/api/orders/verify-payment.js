import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { verifyUsdtPayment } from "../../../lib/bscscan";
import { fulfillOrder } from "../../../lib/fulfillOrder";
import { claimTxHash, confirmTxHash, releaseTxHash } from "../../../lib/claimTxHash";
import { frozenSeconds, recordWrongHash, isWrongHash, frozenResponse } from "../../../lib/hashLimit";

// Step 2 of checkout: customer submits the tx hash of their USDT
// (BEP20) transfer. We verify it on-chain, and if it checks out we
// immediately buy from DigiTrust and store the delivered items.
//
// Two things make this safe under double-clicks / parallel requests:
//  1. Claiming the order (pending_payment -> payment_submitted) is a
//     single conditional UPDATE — only one concurrent request can
//     ever win it.
//  2. Claiming the tx hash is a single atomic INSERT into a table
//     keyed on lower(tx_hash) — only one concurrent request can ever
//     claim the same transaction, and it can't be reused for a
//     different order or a wallet top-up either.
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

  const { order_id, tx_hash: rawTxHash } = req.body || {};
  if (!order_id || !rawTxHash) {
    return res.status(400).json({ success: false, error: "invalid_request" });
  }
  const tx_hash = rawTxHash.toLowerCase();

  // Too many wrong hashes recently → short freeze.
  const frozen = await frozenSeconds(session.user.id);
  if (frozen > 0) return res.status(429).json(frozenResponse(frozen));

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", order_id)
    .eq("user_id", session.user.id)
    .single();

  if (orderErr || !order) {
    return res.status(404).json({ success: false, error: "order_not_found" });
  }

  // Atomically claim this tx hash before we do anything else. If it's
  // already claimed (by this order, another order, or a wallet
  // top-up — including a differently-cased version of the same
  // hash), this fails immediately.
  const claim = await claimTxHash(tx_hash, "order", order.id);
  if (!claim.claimed) {
    const lock = await recordWrongHash(session.user.id);
    return res.status(409).json({
      success: false,
      error: lock ? "too_many_attempts" : "tx_already_used",
      ...(lock ? { retry_after: lock } : {}),
    });
  }

  // Atomically claim the order itself: only succeeds if it's still
  // pending_payment. A second, parallel request (double-click) gets
  // 0 rows back here and bails out immediately instead of racing
  // through to a second DigiTrust purchase.
  const { data: claimedOrder, error: claimErr } = await supabaseAdmin
    .from("orders")
    .update({ status: "payment_submitted", tx_hash, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select()
    .single();

  if (claimErr || !claimedOrder) {
    await releaseTxHash(tx_hash);
    return res.status(409).json({ success: false, error: `order_already_${order.status}` });
  }

  const verdict = await verifyUsdtPayment({
    txHash: tx_hash,
    expectedAmount: claimedOrder.expected_amount,
  });

  if (!verdict.ok) {
    // Retryable — release both the order and the tx-hash claim so
    // the customer (or a retry) can try again once the tx confirms.
    await supabaseAdmin
      .from("orders")
      .update({ status: "pending_payment", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    await releaseTxHash(tx_hash);
    const lock = isWrongHash(verdict.reason) ? await recordWrongHash(session.user.id) : 0;
    return res.status(lock ? 429 : 202).json({
      success: false,
      error: lock ? "too_many_attempts" : verdict.reason,
      ...(lock ? { retry_after: lock } : {}),
    });
  }

  // Confirmed — burn the hash permanently and proceed.
  await confirmTxHash(tx_hash);

  await supabaseAdmin
    .from("orders")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", order.id);

  const result = await fulfillOrder(claimedOrder);
  if (!result.success) {
    return res.status(502).json({ success: false, error: result.error });
  }
  return res.status(200).json({ success: true, items: result.items, manual: result.manual || false });
}
