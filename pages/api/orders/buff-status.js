import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { settleBuffOrder } from "../../../lib/tunvnBuff";

// Customer's My Orders page calls this while a Muse AI buff-token order is
// still "fulfilling". Owner-only; TunVN is asked at most once per call.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  let session = null;
  try {
    const supabaseServer = createPagesServerClient({ req, res });
    const sessionRes = await supabaseServer.auth.getSession();
    session = sessionRes.data?.session || null;
  } catch {}

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ success: false, error: "order_id_required" });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status, supplier, supplier_order_id, activation_info, quantity, updated_at, created_at")
    .eq("id", order_id)
    .maybeSingle();
  if (!order) return res.status(404).json({ success: false, error: "order_not_found" });

  // If order belongs to an authenticated user, require that user's session
  if (order.user_id && (!session || order.user_id !== session.user.id)) {
    return res.status(403).json({ success: false, error: "not_your_order" });
  }

  const result = await settleBuffOrder(order);
  return res.status(200).json({ success: true, state: result.state });
}
