import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { verifyUsdtTopup } from "../../../lib/bscscan";
import { claimTxHash, confirmTxHash, releaseTxHash } from "../../../lib/claimTxHash";
import { frozenSeconds, recordWrongHash, isWrongHash, frozenResponse } from "../../../lib/hashLimit";

// Customer must first create a deposit invoice (see
// create-deposit-invoice.js), which assigns a unique exact amount
// (e.g. $10.0047) to their requested round amount (e.g. $10). They
// send exactly that amount, then submit the tx hash here.
//
// Why: crediting "whatever amount the tx moved" (the old behavior)
// let anyone who sees a pending transfer to our payout wallet on the
// public blockchain race the real sender to submit that hash first.
// Matching the on-chain amount against an invoice ONLY the current
// user holds — and never releasing that unique amount to anyone else
// while it's still pending — makes that race impossible: an
// attacker's own transaction can only ever match an invoice the
// attacker themselves created, so claiming someone else's transfer
// no longer buys them anything.
// Invoices differ by as little as 0.0001, so the match must be exact —
// this only absorbs float rounding, never a neighboring invoice.
const AMOUNT_TOLERANCE = 0.00002;

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

  const { tx_hash: rawTxHash, invoice_id } = req.body || {};
  if (!rawTxHash) {
    return res.status(400).json({ success: false, error: "tx_hash_required" });
  }
  if (!invoice_id) {
    return res.status(400).json({ success: false, error: "invoice_required" });
  }
  const tx_hash = rawTxHash.toLowerCase();

  // Too many wrong hashes recently → short freeze.
  const frozen = await frozenSeconds(session.user.id);
  if (frozen > 0) return res.status(429).json(frozenResponse(frozen));

  // The invoice must belong to this user and still be pending and
  // unexpired. RLS already restricts SELECT to the owner, but we use
  // the service-role client here (consistent with the rest of this
  // route) and check user_id explicitly ourselves.
  const { data: invoice, error: invErr } = await supabaseAdmin
    .from("wallet_deposit_invoices")
    .select("id, user_id, requested_amount, unique_amount, status, expires_at")
    .eq("id", invoice_id)
    .single();

  if (invErr || !invoice || invoice.user_id !== session.user.id) {
    return res.status(404).json({ success: false, error: "invoice_not_found" });
  }
  if (invoice.status !== "pending") {
    return res.status(409).json({ success: false, error: "invoice_not_pending" });
  }
  if (new Date(invoice.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("wallet_deposit_invoices")
      .update({ status: "expired" })
      .eq("id", invoice.id)
      .eq("status", "pending"); // don't resurrect one matched moments ago
    return res.status(410).json({ success: false, error: "invoice_expired" });
  }

  // Atomic claim — the same hash can't be credited twice, reused on
  // an order, or raced by a double-click, no matter its letter case.
  const claim = await claimTxHash(tx_hash, "topup", invoice.id);
  if (!claim.claimed) {
    const lock = await recordWrongHash(session.user.id);
    return res.status(409).json({
      success: false,
      error: lock ? "too_many_attempts" : "tx_already_used",
      ...(lock ? { retry_after: lock } : {}),
    });
  }

  const verdict = await verifyUsdtTopup({ txHash: tx_hash });
  if (!verdict.ok) {
    await releaseTxHash(tx_hash);
    const lock = isWrongHash(verdict.reason) ? await recordWrongHash(session.user.id) : 0;
    return res.status(lock ? 429 : 202).json({
      success: false,
      error: lock ? "too_many_attempts" : verdict.reason,
      ...(lock ? { retry_after: lock } : {}),
    });
  }

  // The core fix: the on-chain amount must match THIS invoice's
  // unique amount, not just "any positive USDT transfer we can find
  // a hash for." A transaction for any other amount — including a
  // stranger's real deposit sitting in the mempool — simply isn't a
  // match for this invoice and credits nothing.
  if (Math.abs(verdict.amount - Number(invoice.unique_amount)) > AMOUNT_TOLERANCE) {
    await releaseTxHash(tx_hash);
    const lock = await recordWrongHash(session.user.id);
    if (lock) {
      return res.status(429).json({ success: false, error: "too_many_attempts", retry_after: lock });
    }
    return res.status(202).json({
      success: false,
      error: "amount_mismatch",
      expected: Number(invoice.unique_amount),
      received: verdict.amount,
    });
  }

  await confirmTxHash(tx_hash);

  // Credit the round amount the customer asked for, not the unique
  // decimal figure — the extra cents were only ever a matching
  // fingerprint, never meant to show up in their balance.
  const creditAmount = Number(invoice.requested_amount);

  const { error: insertErr } = await supabaseAdmin.from("wallet_topups").insert({
    user_id: session.user.id,
    tx_hash,
    amount: creditAmount,
    status: "credited",
  });
  if (insertErr && insertErr.code !== "23505") {
    return res.status(500).json({ success: false, error: insertErr.message });
  }

  // Mark the invoice matched — frees its unique_amount isn't
  // necessary since the partial unique index only applies to
  // status='pending' rows, but marking it closes the loop so it can
  // never be matched against a second transaction.
  await supabaseAdmin
    .from("wallet_deposit_invoices")
    .update({ status: "matched", tx_hash })
    .eq("id", invoice.id)
    .eq("status", "pending");

  // Atomic, single-statement balance credit.
  const { data: newBalance, error: balErr } = await supabaseAdmin.rpc(
    "increment_balance",
    { p_user_id: session.user.id, p_amount: creditAmount }
  );
  if (balErr) {
    return res.status(500).json({ success: false, error: balErr.message });
  }

  return res.status(200).json({ success: true, credited: creditAmount, balance: newBalance });
}
