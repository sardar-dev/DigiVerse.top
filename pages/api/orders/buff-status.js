import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { settleBuffOrder } from "../../../lib/tunvnBuff";

// Customer's My Orders page calls this while a Muse AI buff-token order is
// still "fulfilling". Owner-only; TunVN is asked at most once per call.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();
  if (!session) return res.status(401).json({ success: false, error: "login_required" });

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ success: false, error: "order_id_required" });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, supplier, supplier_order_id, activation_info, quantity, updated_at, created_at")
    .eq("id", order_id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!order) return res.status(404).json({ success: false, error: "order_not_found" });

  const result = await settleBuffOrder(order);
  return res.status(200).json({ success: true, state: result.state });
}
