import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { dbError } from "../../../lib/withdrawals";

// GET  -> all pending requests + the 50 most recent resolved ones
// POST -> { id, status: "approved" | "rejected", note?, payout_tx? }
//         (rejecting gives the money back to the user's balance)
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const cols = "id, request_number, user_id, amount, address, network, method, details, status, admin_note, payout_tx, created_at, resolved_at";
    const [pending, done] = await Promise.all([
      supabaseAdmin.from("withdrawal_requests").select(cols).eq("status", "pending").order("created_at", { ascending: true }).limit(200),
      supabaseAdmin.from("withdrawal_requests").select(cols).neq("status", "pending").order("resolved_at", { ascending: false }).limit(50),
    ]);
    const err = pending.error || done.error;
    if (err) return res.status(500).json({ success: false, error: dbError(err) });
    const rows = [...(pending.data || []), ...(done.data || [])];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const info = new Map();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email, balance").in("id", ids);
      for (const p of profiles || []) info.set(p.id, p);
    }
    const withUser = (r) => ({ ...r, email: info.get(r.user_id)?.email || null, balance: info.get(r.user_id)?.balance ?? null });
    return res.status(200).json({ success: true, pending: (pending.data || []).map(withUser), done: (done.data || []).map(withUser) });
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  const { id, status, note, payout_tx } = req.body || {};
  if (!id || !["approved", "rejected"].includes(status)) return res.status(400).json({ success: false, error: "invalid_request" });
  const { data, error } = await supabaseAdmin.rpc("resolve_withdrawal", {
    p_id: id,
    p_status: status,
    p_note: String(note || "").slice(0, 300),
    p_tx: String(payout_tx || "").trim().slice(0, 120),
  });
  if (error) return res.status(500).json({ success: false, error: dbError(error) });
  if (!data?.ok) return res.status(409).json({ success: false, error: data?.error || "failed" });
  return res.status(200).json({ success: true });
}
