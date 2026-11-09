import * as tunvn from "../../../lib/suppliers/tunvn";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Public endpoint to check how many Muse AI Buff tokens can currently
// be fulfilled with TunVN's live wallet balance.
// Response: { success: true, is_buff: boolean, max_qty: number, balance: number, unit_cost: number }
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");

  const productId = req.query.product_id || req.body?.product_id;
  if (!productId) {
    return res.status(200).json({ success: false, is_buff: false });
  }

  try {
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("cost_price, max_order_qty, tunvn_buff")
      .eq("id", productId)
      .maybeSingle();

    if (!prod || !prod.tunvn_buff) {
      return res.status(200).json({ success: true, is_buff: false });
    }

    if (!tunvn.configured()) {
      return res.status(200).json({ success: false, is_buff: true, max_qty: 0, reason: "supplier_not_configured" });
    }

    const { balance } = await tunvn.getBalance();
    const bal = Number.isFinite(balance) ? Math.max(0, balance) : 0;

    let unitCost = Number(prod.cost_price) > 0 ? Number(prod.cost_price) : 0.06;
    let maxLimit = Number(prod.max_order_qty) > 0 ? Number(prod.max_order_qty) : 30;

    const affordable = unitCost > 0 ? Math.floor(bal / unitCost) : 0;
    const finalMax = Math.min(affordable, maxLimit);

    return res.status(200).json({
      success: true,
      is_buff: true,
      max_qty: finalMax,
      balance: Number(bal.toFixed(4)),
      unit_cost: unitCost,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      is_buff: true,
      max_qty: 0,
      error: e.message,
    });
  }
}
