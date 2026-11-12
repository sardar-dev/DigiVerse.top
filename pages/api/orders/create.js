import crypto from "crypto";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getSupplier, resolveSource, applyBuffer } from "../../../lib/suppliers";
import { refreshSourceFromLive } from "../../../lib/syncProducts";
import { checkCoupon, orderFitsCouponLimits } from "../../../lib/coupons";
import * as tunvn from "../../../lib/suppliers/tunvn";

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

  const { product_id, quantity = 1, email, activation_info, coupon_code, gifts_to_redeem = 0 } = req.body || {};
  let finalActivation = activation_info;
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
    // Enforce min/max order quantity for manual products
    const minQty = localProduct.min_order_qty ?? 1;
    const maxQty = localProduct.max_order_qty ?? null;
    if (quantity < minQty) {
      return res.status(400).json({ success: false, error: "qty_below_minimum", min_qty: minQty });
    }
    if (maxQty !== null && quantity > maxQty) {
      return res.status(400).json({ success: false, error: "qty_exceeds_maximum", max_qty: maxQty });
    }
    if (localProduct.activation_field && !String(activation_info || "").trim()) {
      return res.status(400).json({ success: false, error: "activation_info_required" });
    }

    // TunVN Buff Token (Muse AI) invite code format check
    if (localProduct.tunvn_buff) {
      let rawCode = String(activation_info || "").trim();
      if (rawCode.includes("http://") || rawCode.includes("https://") || rawCode.includes("/")) {
        try {
          const u = new URL(rawCode.startsWith("http") ? rawCode : `https://${rawCode}`);
          const parts = u.pathname.split("/").filter(Boolean);
          const codeFromPath = parts[parts.length - 1];
          const codeFromParam = u.searchParams.get("invite") || u.searchParams.get("ref") || u.searchParams.get("code");
          rawCode = (codeFromParam || codeFromPath || rawCode).trim();
        } catch {
          const m = rawCode.match(/([A-Za-z0-9_-]{4,32})\s*$/);
          if (m) rawCode = m[1];
        }
      }
      if (!/^[A-Za-z0-9_-]{4,32}$/.test(rawCode)) {
        return res.status(400).json({
          success: false,
          error: "invalid_invite_code",
          message: "Please enter a valid Muse AI invite code (4–32 alphanumeric characters).",
        });
      }
      finalActivation = rawCode;
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
  let unitCost = null; // what this product costs us right now (stored on the order)
  if (localProduct.provider === "manual") {
    availableNow = localProduct.available_stock;
    unitCost = Number(localProduct.cost_price);
  } else {
    try {
      const src = await resolveSource(localProduct);
      const supplier = src && (await getSupplier(src.supplier));
      if (!supplier || (localProduct.requires_email && !supplier.supportsEmail)) {
        console.warn("[orders/create] no usable supplier source", { product_id, active: localProduct.active_supplier });
        return res.status(409).json({ success: false, error: "supplier_unavailable" });
      }
      const live = await supplier.api.getProduct(src.supplierProductId);
      availableNow = applyBuffer(live.stock);
      unitCost = Number(live.cost);
      // Margin guard: if the supplier's live price jumped above our sell
      // price since the last sync (and the admin hasn't approved this
      // source), don't sell it at a loss — treat it as unavailable.
      if (!src.approved && Number(live.cost) > Number(localProduct.sell_price) + 1e-9) {
        console.warn("[orders/create] supplier price above sell price", {
          product_id,
          supplier: supplier.id,
          cost: live.cost,
          sell: localProduct.sell_price,
        });
        try {
          await refreshSourceFromLive(localProduct.id, src.supplier, live);
        } catch {}
        return res.status(409).json({ success: false, error: "supplier_unavailable" });
      }
      if (availableNow < quantity) {
        console.warn("[orders/create] not enough supplier stock", {
          product_id,
          supplier: supplier.id,
          liveStock: live.stock,
          buffer: live.stock - availableNow,
          quantity,
        });
        // Stored data was stale — fix it now so the product hides/switches
        // immediately (best effort; never blocks the response).
        try {
          await refreshSourceFromLive(localProduct.id, src.supplier, live);
        } catch {}
      }

      // Balance check: if the supplier has a balance API, ensure our
      // account can afford this order.
      if (Number.isFinite(unitCost) && unitCost > 0) {
        try {
          const { balance } = await supplier.api.getBalance();
          if (Number.isFinite(balance)) {
            const requiredCost = unitCost * quantity;
            const affordableQty = Math.max(0, Math.floor((balance + 1e-6) / unitCost));
            if (balance < requiredCost - 1e-6) {
              console.warn("[orders/create] insufficient supplier balance", {
                product_id,
                supplier: supplier.id,
                balance,
                unitCost,
                affordableQty,
                requested: quantity,
                requiredCost,
              });
              return res.status(409).json({
                success: false,
                error: "supplier_balance_limit",
                max_qty: affordableQty,
              });
            }
          }
        } catch (balErr) {
          // Balance check is best-effort — if the API is down or doesn't
          // support it, we let the order proceed and handle a failure at
          // payment/fulfilment instead of blocking all orders.
          console.warn("[orders/create] balance check failed (non-fatal)", balErr?.message);
        }
      }
    } catch (e) {
      console.warn("[orders/create] live supplier stock check failed, trying cached stock fallback:", e?.message);
      // Graceful fallback: If live check threw (e.g. supplier API timeout or transient error),
      // check if we have cached available_stock in localProduct. If cached stock is sufficient, allow order.
      if (
        localProduct.available_stock !== undefined &&
        localProduct.available_stock !== null &&
        Number(localProduct.available_stock) >= quantity
      ) {
        availableNow = Number(localProduct.available_stock);
        unitCost = Number(localProduct.cost_price) || null;
      } else {
        return res.status(502).json({
          success: false,
          error: "stock_check_failed",
          message: "Unable to verify supplier stock right now. Please try again shortly.",
        });
      }
    }
  }

  if (availableNow < quantity) {
    return res.status(409).json({
      success: false,
      error: "not_enough_stock",
      available: availableNow,
    });
  }

  const giftsCount = Math.floor(Number(gifts_to_redeem) || 0);
  const orderId = crypto.randomUUID();

  // Validate referral gift parameters early
  if (giftsCount > 0) {
    if (!localProduct.tunvn_buff) {
      return res.status(400).json({ success: false, error: "gifts_only_for_muse_ai" });
    }
    if (giftsCount > quantity) {
      return res.status(400).json({ success: false, error: "cannot_redeem_more_gifts_than_qty" });
    }
  }

  const unitPrice = Number(localProduct.sell_price);
  const paidQty = Math.max(0, quantity - giftsCount);
  const giftDiscount = Number((giftsCount * unitPrice).toFixed(2));
  const fullBase = Number((unitPrice * paidQty).toFixed(2));

  // Optional coupon — fully re-validated here on the server; the
  // popup's preview is never trusted.
  let coupon = null;
  let discount = 0;
  if (coupon_code && String(coupon_code).trim() && fullBase > 0) {
    const result = await checkCoupon({
      code: coupon_code,
      userId: session.user.id,
      productId: product_id,
      base: fullBase,
      unitCost, // live supplier cost (or the manual product's cost)
      quantity: paidQty,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.reason, min_order: result.min_order });
    }
    coupon = result.coupon;
    discount = result.discount;
  }
  const base = Math.max(0, Number((fullBase - discount).toFixed(2)));

  // If order is fully covered by gifts/discount, total is exactly 0.00
  let total;
  if (base <= 0) {
    total = 0.0;
  } else {
    const fingerprint = Math.floor(Math.random() * 9) + 1; // 1-9
    total = Number((base + fingerprint / 10000).toFixed(4)); // e.g. 5 -> 5.0004
  }

  const orderRow = {
      id: orderId,
      user_id: session.user.id,
      product_id,
      quantity,
      unit_price: unitPrice,
      total,
      email: email || null,
      activation_info: localProduct.provider === "manual" ? (finalActivation || null) : null,
      status: "pending_payment",
      payout_wallet: process.env.PAYOUT_WALLET_ADDRESS,
      expected_amount: total,
      // Only sent when gifts are actually redeemed, so normal orders keep working
      // even before migration_036 has been run.
      ...(giftsCount > 0 ? { gifts_redeemed: giftsCount, gift_discount: giftDiscount } : {}),
      // Only sent when a coupon is used, so normal orders keep working
      // even before migration_010 has been run.
      ...(coupon
        ? { coupon_id: coupon.id, coupon_code: coupon.code, discount_amount: discount }
        : {}),
  };
  // unit_cost = cost at the time of sale (migration 015). Falls back to a
  // plain insert if that column doesn't exist yet.
  const costField = Number.isFinite(unitCost) ? { unit_cost: unitCost } : {};
  let insertPayload = { ...orderRow, ...costField };

  // 1. Insert order into public.orders FIRST so order row exists for foreign keys
  let { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert(insertPayload)
    .select()
    .single();

  // Gracefully fallback if migration 036 or 015 columns haven't been created yet
  if (orderErr && /gift_discount|gifts_redeemed/i.test(orderErr.message)) {
    delete insertPayload.gift_discount;
    delete insertPayload.gifts_redeemed;
    ({ data: order, error: orderErr } = await supabaseAdmin.from("orders").insert(insertPayload).select().single());
  }

  if (orderErr && /unit_cost/i.test(orderErr.message)) {
    delete insertPayload.unit_cost;
    ({ data: order, error: orderErr } = await supabaseAdmin.from("orders").insert(insertPayload).select().single());
  }

  if (orderErr) {
    return res.status(500).json({ success: false, error: orderErr.message });
  }

  // 2. Now atomically reserve referral gifts with valid order.id
  if (giftsCount > 0) {
    const { error: reserveErr } = await supabaseAdmin.rpc("reserve_gifts_for_order", {
      p_user_id: session.user.id,
      p_order_id: order.id,
      p_product_id: product_id,
      p_gift_count: giftsCount,
    });
    if (reserveErr) {
      // Reservation failed — clean up the pending order row
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return res.status(400).json({ success: false, error: reserveErr.message });
    }
  }


  // Two customers can race for the last use of a limited coupon; the
  // later order is rejected here (and cancelled so it holds no use).
  if (coupon && !(await orderFitsCouponLimits(coupon, order.id, session.user.id))) {
    if (giftsCount > 0) {
      await supabaseAdmin.rpc("release_reserved_gifts", { p_order_id: order.id });
    }
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    return res.status(409).json({ success: false, error: "coupon_used_up" });
  }

  return res.status(200).json({ success: true, order });
}
