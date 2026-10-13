import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { checkCoupon } from "../../../lib/coupons";

// Preview only: tells the checkout popup what a code would take off.
// Nothing is reserved here — the real check runs again in orders/create.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }
  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();
  if (!session) return res.status(401).json({ success: false, error: "login_required" });

  const { code, product_id, quantity = 1 } = req.body || {};
  const qty = Number(quantity);
  if (!code || !product_id || !Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ success: false, error: "invalid_request" });
  }

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("sell_price")
    .eq("id", product_id)
    .eq("selected", true)
    .single();
  if (!product) return res.status(404).json({ success: false, error: "product_not_available" });

  const base = Number((Number(product.sell_price) * qty).toFixed(2));
  const result = await checkCoupon({
    code,
    userId: session.user.id,
    productId: product_id,
    base,
  });
  if (!result.ok) {
    return res.status(200).json({ success: false, error: result.reason, min_order: result.min_order });
  }
  return res.status(200).json({
    success: true,
    code: result.coupon.code,
    base,
    discount: result.discount,
    final: Number((base - result.discount).toFixed(2)),
  });
}
