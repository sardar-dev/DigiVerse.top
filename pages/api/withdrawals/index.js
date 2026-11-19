import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { MIN_WITHDRAWAL, MAX_PENDING, validatePayout, dbError } from "../../../lib/withdrawals";
import { notifyTelegramWithdrawal } from "../../../lib/telegram";

// GET  -> the user's own recent requests + limits
// POST -> { amount, address } creates a request; the amount leaves the
//         balance immediately (atomic, in the database) and comes back if
//         the admin rejects it.
export default async function handler(req, res) {
  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();
  if (!session) return res.status(401).json({ success: false, error: "login_required" });
  const userId = session.user.id;

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id, request_number, amount, address, method, details, status, admin_note, payout_tx, created_at, resolved_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return res.status(500).json({ success: false, error: dbError(error) });
    return res.status(200).json({ success: true, requests: data || [], min: MIN_WITHDRAWAL, maxPending: MAX_PENDING });
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  const pay = validatePayout(req.body);
  if (!pay.ok) return res.status(400).json({ success: false, error: pay.error });
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) return res.status(400).json({ success: false, error: "invalid_amount" });

  const { data, error } = await supabaseAdmin.rpc("request_withdrawal", {
    p_user: userId,
    p_amount: amount,
    p_address: pay.address,
    p_min: MIN_WITHDRAWAL,
    p_max_pending: MAX_PENDING,
    p_method: pay.method,
    p_details: pay.details,
  });
  if (error) return res.status(500).json({ success: false, error: dbError(error) });
  if (!data?.ok) return res.status(400).json({ success: false, error: data?.error || "failed", min: MIN_WITHDRAWAL });

  // Send Telegram live alert to admin (fire & forget, never blocks user response)
  try {
    notifyTelegramWithdrawal({
      email: session.user.email,
      amount,
      method: pay.method,
      address: pay.address,
      requestNumber: data.request_number,
      newBalance: Number(data.balance),
    }).catch((e) => console.warn("[withdrawal] telegram alert error:", e?.message));
  } catch {}

  return res.status(200).json({ success: true, request_number: data.request_number, balance: Number(data.balance) });
}
