import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

const LIMIT = 150;

// Recent wallet deposits for the admin: credited top-ups (with the
// exact on-chain amount from the matching invoice) plus invoices that
// were requested but never paid (pending / expired). Runs only when the
// tab is opened or refreshed.
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  const [topupsRes, invoicesRes] = await Promise.all([
    supabaseAdmin
      .from("wallet_topups")
      .select("id, user_id, tx_hash, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("wallet_deposit_invoices")
      .select("id, user_id, requested_amount, unique_amount, status, tx_hash, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);
  if (topupsRes.error) return res.status(500).json({ success: false, error: topupsRes.error.message });
  if (invoicesRes.error) return res.status(500).json({ success: false, error: invoicesRes.error.message });

  const topups = topupsRes.data || [];
  const invoices = invoicesRes.data || [];

  const userIds = [...new Set([...topups, ...invoices].map((r) => r.user_id))];
  const emails = new Map();
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    for (const p of profiles || []) emails.set(p.id, p.email);
  }

  // Exact on-chain amount for a credited top-up = its matched invoice.
  const invoiceByTx = new Map();
  for (const inv of invoices) if (inv.tx_hash) invoiceByTx.set(inv.tx_hash.toLowerCase(), inv);

  const now = Date.now();
  const rows = [
    ...topups.map((t) => ({
      id: `t-${t.id}`,
      status: t.status === "credited" ? "credited" : t.status,
      email: emails.get(t.user_id) || "unknown",
      credited: Number(t.amount),
      exact: invoiceByTx.get(String(t.tx_hash).toLowerCase())?.unique_amount ?? null,
      tx_hash: t.tx_hash,
      created_at: t.created_at,
    })),
    // Invoices that never became a top-up (matched ones are covered above).
    ...invoices
      .filter((i) => i.status !== "matched")
      .map((i) => ({
        id: `i-${i.id}`,
        status:
          i.status === "pending" && new Date(i.expires_at).getTime() < now
            ? "expired"
            : i.status,
        email: emails.get(i.user_id) || "unknown",
        credited: null,
        requested: Number(i.requested_amount),
        exact: Number(i.unique_amount),
        tx_hash: null,
        created_at: i.created_at,
      })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const day = now - 24 * 60 * 60 * 1000;
  const credited = rows.filter((r) => r.status === "credited");
  return res.status(200).json({
    success: true,
    rows,
    summary: {
      credited24hCount: credited.filter((r) => new Date(r.created_at).getTime() >= day).length,
      credited24hAmount: Number(
        credited
          .filter((r) => new Date(r.created_at).getTime() >= day)
          .reduce((s, r) => s + r.credited, 0)
          .toFixed(2)
      ),
      pending: rows.filter((r) => r.status === "pending").length,
    },
  });
}
