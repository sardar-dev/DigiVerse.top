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

    let unitCost = Number(prod.cost_price) > 0 ? Number(prod.cost_price) : 0.06;
    let maxLimit = Number(prod.max_order_qty) > 0 ? Number(prod.max_order_qty) : 30;

    let finalMax = maxLimit;
    let balVal = null;

    try {
      const { balance } = await tunvn.getBalance();
      if (Number.isFinite(balance)) {
        balVal = Math.max(0, balance);
        const affordable = unitCost > 0 ? Math.floor(balVal / unitCost) : 0;
        finalMax = Math.min(affordable, maxLimit);
      }
    } catch (balErr) {
      console.warn("[buff-info] TunVN balance fetch error (falling back to product maxLimit):", balErr?.message);
    }

    return res.status(200).json({
      success: true,
      is_buff: true,
      max_qty: finalMax,
      balance: balVal !== null ? Number(balVal.toFixed(4)) : null,
      unit_cost: unitCost,
    });
  } catch (e) {
    return res.status(200).json({
      success: true,
      is_buff: true,
      max_qty: 30,
      error: e.message,
    });
  }
}
