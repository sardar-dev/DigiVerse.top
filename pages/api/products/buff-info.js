import * as tunvn from "../../../lib/suppliers/tunvn";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Public endpoint to check how many Muse AI Buff tokens can currently
// be fulfilled with TunVN's live wallet balance.
// Response: { success: true, max_qty: number, balance: number, unit_cost: number }
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");

  if (!tunvn.configured()) {
    return res.status(200).json({ success: false, max_qty: 0, reason: "supplier_not_configured" });
  }

  try {
    const { balance } = await tunvn.getBalance();
    const bal = Number.isFinite(balance) ? Math.max(0, balance) : 0;

    let unitCost = 0.06;
    let maxLimit = 30;

    const productId = req.query.product_id || req.body?.product_id;
    if (productId) {
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("cost_price, max_order_qty")
        .eq("id", productId)
        .maybeSingle();

      if (prod) {
        if (Number(prod.cost_price) > 0) unitCost = Number(prod.cost_price);
        if (Number(prod.max_order_qty) > 0) maxLimit = Number(prod.max_order_qty);
      }
    }

    const affordable = unitCost > 0 ? Math.floor(bal / unitCost) : 0;
    const finalMax = Math.min(affordable, maxLimit);

    return res.status(200).json({
      success: true,
      max_qty: finalMax,
      balance: Number(bal.toFixed(4)),
      unit_cost: unitCost,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      max_qty: 0,
      error: e.message,
    });
  }
}

