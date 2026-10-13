import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const INVOICE_TTL_MINUTES = 30;

// Creates a unique-amount deposit invoice: the customer asks for a
// round dollar amount (e.g. $10), and we hand back a specific amount
// (e.g. $10.0047) that's the ONLY pending invoice anywhere in the
// system claiming that exact figure right now. That's what the
// unique index on (unique_amount) where status='pending' enforces —
// this endpoint just retries with a new random offset on the rare
// collision instead of trusting its own pre-check.
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

  const requestedAmount = Number(req.body?.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount < 0.1) {
    return res.status(400).json({ success: false, error: "invalid_amount" });
  }
  // Round to cents — the unique, unpredictable part lives entirely in
  // the extra decimal places added below.
  const base = Math.round(requestedAmount * 100) / 100;

  // Opportunistic cleanup: expire the caller's own stale pending
  // invoices so they don't pile up. No cron — this runs on every
  // invoice request, which is exactly when it's needed.
  await supabaseAdmin
    .from("wallet_deposit_invoices")
    .update({ status: "expired" })
    .eq("user_id", session.user.id)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const expiresAt = new Date(Date.now() + INVOICE_TTL_MINUTES * 60 * 1000).toISOString();

  // Fingerprint format: <base>.00 + one random digit 1-9 appended after
  // the cents, e.g. 0.80 -> 0.8001 ... 0.8009, 5 -> 5.0003. Every digit
  // is tried (in random order) until one isn't held by another pending
  // invoice for the same base amount.
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);

  for (const digit of digits) {
    const uniqueAmount = Math.round((base + digit / 10000) * 10000) / 10000;

    const { data, error } = await supabaseAdmin
      .from("wallet_deposit_invoices")
      .insert({
        user_id: session.user.id,
        requested_amount: base,
        unique_amount: uniqueAmount,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id, unique_amount, expires_at")
      .single();

    if (!error) {
      return res.status(200).json({
        success: true,
        invoice: {
          id: data.id,
          amount: data.unique_amount,
          expires_at: data.expires_at,
        },
        payout_wallet: process.env.PAYOUT_WALLET_ADDRESS || "",
      });
    }

    // 23505 = unique_violation on the active-amount index — someone
    // else currently holds this exact figure, so try the next digit.
    if (error.code !== "23505") {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(503).json({ success: false, error: "could_not_allocate_amount" });
}
