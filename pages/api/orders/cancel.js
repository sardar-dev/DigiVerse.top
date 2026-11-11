import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Only orders that haven't been paid yet can be self-cancelled — once
// money has moved (paid/delivered/etc), that needs an admin decision
// (refund), not a customer button, since real funds are involved.
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

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, status")
    .eq("id", order_id)
    .eq("user_id", session.user.id)
    .single();

  if (orderErr || !order) {
    return res.status(404).json({ success: false, error: "order_not_found" });
  }

  if (order.status !== "pending_payment") {
    return res.status(409).json({ success: false, error: "cannot_cancel_paid_order" });
  }

  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", order.id);

  if (error) return res.status(500).json({ success: false, error: error.message });

  // Release any gifts that were reserved for this order
  await supabaseAdmin.rpc("release_reserved_gifts", { p_order_id: order.id });

  return res.status(200).json({ success: true });
}
