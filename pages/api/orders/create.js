import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getSupplier, resolveSource, applyBuffer } from "../../../lib/suppliers";
import { refreshSourceFromLive } from "../../../lib/syncProducts";
import { checkCoupon, orderFitsCouponLimits } from "../../../lib/coupons";

// Step 1 of checkout: customer picks a product + quantity. We
// re-check LIVE stock on DigiTrust (not just our cache) before we
// even quote a payment amount, so we never ask someone to pay for
// something that just sold out elsewhere.
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

  const { product_id, quantity = 1, email, activation_info, coupon_code } = req.body || {};
  if (!product_id || quantity < 1) {
    return res.status(400).json({ success: false, error: "invalid_request" });
  }

  const { data: localProduct, error: localErr } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", product_id)
    .eq("selected", true)
    .single();

  if (localErr || !localProduct) {
    return res.status(404).json({ success: false, error: "product_not_available" });
  }

  // Manual products: whatever the admin set as activation_field
  // ('email' or 'username') is required here. DigiTrust products use
  // the older, separate requires_email flag.
  if (localProduct.provider === "manual") {
    if (localProduct.activation_field && !String(activation_info || "").trim()) {
      return res.status(400).json({ success: false, error: "activation_info_required" });
    }
  } else if (localProduct.requires_email && !email) {
    return res.status(400).json({ success: false, error: "email_required" });
  }

  // Live recheck: for DigiTrust products, re-check against DigiTrust
  // itself (buffer applied). For manual products, DigiTrust is never
  // called — we just re-read our own stock, which is the source of
  // truth (the real atomic decrement happens later, at payment
  // confirmation, via decrement_manual_stock).
  let availableNow;
  if (localProduct.provider === "manual") {
    availableNow = localProduct.available_stock;
  } else {
    try {
      const src = await resolveSource(localProduct);
      const supplier = src && getSupplier(src.supplier);
      if (!supplier || (localProduct.requires_email && !supplier.supportsEmail)) {
        return res.status(409).json({ success: false, error: "not_enough_stock", available: 0 });
      }
      const live = await supplier.api.getProduct(src.supplierProductId);
      availableNow = applyBuffer(live.stock);
      // Margin guard: if the supplier's live price jumped above our sell
      // price since the last sync (and the admin hasn't approved this
      // source), don't sell it at a loss — treat it as unavailable.
      if (!src.approved && Number(live.cost) > Number(localProduct.sell_price) + 1e-9) {
        availableNow = 0;
      }
      if (availableNow < quantity) {
        // Stored data was stale — fix it now so the product hides/switches
        // immediately (best effort; never blocks the response).
        try {
          await refreshSourceFromLive(localProduct.id, src.supplier, live);
        } catch {}
      }
    } catch (e) {
      return res.status(502).json({ success: false, error: "stock_check_failed" });
    }
  }

  if (availableNow < quantity) {
    return res.status(409).json({
      success: false,
      error: "not_enough_stock",
      available: availableNow,
    });
  }

  const unitPrice = Number(localProduct.sell_price);
  const fullBase = Number((unitPrice * quantity).toFixed(2));

  // Optional coupon — fully re-validated here on the server; the
  // popup's preview is never trusted.
  let coupon = null;
  let discount = 0;
  if (coupon_code && String(coupon_code).trim()) {
    const result = await checkCoupon({
      code: coupon_code,
      userId: session.user.id,
      productId: product_id,
      base: fullBase,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.reason, min_order: result.min_order });
    }
    coupon = result.coupon;
    discount = result.discount;
  }
  const base = Number((fullBase - discount).toFixed(2));

  // Same unique-fingerprint trick used for wallet top-up invoices:
  // the customer is asked to send base + a random 0.0001-0.0009 tail
  // (e.g. $5 -> $5.0004) instead of a round figure. This isn't for
  // collision-avoidance here (orders are matched by tx hash, not by
  // amount lookup) — it's so the on-chain amount a bystander sees
  // pending to our wallet can never be "obviously" the round price of
  // a product, which is the same front-running protection wallet
  // deposits already get.
  const fingerprint = Math.floor(Math.random() * 9) + 1; // 1-9
  const total = Number((base + fingerprint / 10000).toFixed(4)); // e.g. 5 -> 5.0004

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: session.user.id,
      product_id,
      quantity,
      unit_price: unitPrice,
      total,
      email: email || null,
      activation_info: localProduct.provider === "manual" ? (activation_info || null) : null,
      status: "pending_payment",
      payout_wallet: process.env.PAYOUT_WALLET_ADDRESS,
      expected_amount: total,
      // Only sent when a coupon is used, so normal orders keep working
      // even before migration_010 has been run.
      ...(coupon
        ? { coupon_id: coupon.id, coupon_code: coupon.code, discount_amount: discount }
        : {}),
    })
    .select()
    .single();

  if (orderErr) {
    return res.status(500).json({ success: false, error: orderErr.message });
  }

  // Two customers can race for the last use of a limited coupon; the
  // later order is rejected here (and cancelled so it holds no use).
  if (coupon && !(await orderFitsCouponLimits(coupon, order.id, session.user.id))) {
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    return res.status(409).json({ success: false, error: "coupon_used_up" });
  }

  return res.status(200).json({ success: true, order });
}
