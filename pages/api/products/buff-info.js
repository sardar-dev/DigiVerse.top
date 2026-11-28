import * as tunvn from "../../../lib/suppliers/tunvn";
import { resolveBuffProvider } from "../../../lib/tunvnBuff";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Public endpoint to check whether a product uses Muse AI Boost API fulfillment
// and whether TunVN enforces an upfront balance cap. Ppure Store allows checkout
// to complete and falls back to Manual queue if its API balance is low.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");

  const productId = req.query.product_id || req.body?.product_id;
  if (!productId) {
    return res.status(200).json({ success: false, is_buff: false });
  }

  try {
    let { data: prod, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("cost_price, max_order_qty, tunvn_buff, buff_provider")
      .eq("id", productId)
      .maybeSingle();
    if (prodErr && /buff_provider/i.test(prodErr.message || "")) {
      ({ data: prod } = await supabaseAdmin
        .from("products")
        .select("cost_price, max_order_qty, tunvn_buff")
        .eq("id", productId)
        .maybeSingle());
    }

    const provider = resolveBuffProvider(prod);
    if (!prod || !provider) {
      return res.status(200).json({ success: true, is_buff: false });
    }

    let unitCost = Number(prod.cost_price) > 0 ? Number(prod.cost_price) : 0.06;
    let maxLimit = Number(prod.max_order_qty) > 0 ? Number(prod.max_order_qty) : 30;

    // Ppure Store orders fall back cleanly to Manual delivery if API balance is short
    if (provider === "ppure") {
      return res.status(200).json({
        success: true,
        is_buff: true,
        provider: "ppure",
        allow_manual_fallback: true,
        max_qty: maxLimit,
        unit_cost: unitCost,
      });
    }

    if (!tunvn.configured()) {
      return res.status(200).json({ success: false, is_buff: true, provider: "tunvn", max_qty: 0, reason: "supplier_not_configured" });
    }

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
