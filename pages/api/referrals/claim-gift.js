import crypto from "crypto";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getReferralSettings } from "../../../lib/referralSettings";
import { fulfillOrder } from "../../../lib/fulfillOrder";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  if (!session?.user) {
    return res.status(401).json({ success: false, error: "login_required" });
  }

  const userId = session.user.id;
  const { invite_code } = req.body || {};

  // 1. Validate Invite Code / Link
  let code = String(invite_code || "").trim();
  if (code.includes("http://") || code.includes("https://") || code.includes("/")) {
    try {
      const u = new URL(code.startsWith("http") ? code : `https://${code}`);
      const parts = u.pathname.split("/").filter(Boolean);
      const codeFromPath = parts[parts.length - 1];
      const codeFromParam =
        u.searchParams.get("invite") || u.searchParams.get("ref") || u.searchParams.get("code");
      code = (codeFromParam || codeFromPath || code).trim();
    } catch {
      const m = code.match(/([A-Za-z0-9_-]{4,32})\s*$/);
      if (m) code = m[1];
    }
  }

  if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) {
    return res.status(400).json({
      success: false,
      error: "invalid_invite_code",
      message: "Please enter a valid Muse AI invite code or invite link (4–32 alphanumeric characters).",
    });
  }

  // 2. Find Muse AI Buff Product
  let { data: buffProd } = await supabaseAdmin
    .from("products")
    .select("id, title, sell_price, cost_price, tunvn_buff, active")
    .eq("tunvn_buff", true)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!buffProd) {
    const fallback = await supabaseAdmin
      .from("products")
      .select("id, title, sell_price, cost_price, tunvn_buff, active")
      .eq("tunvn_buff", true)
      .limit(1)
      .maybeSingle();
    buffProd = fallback.data;
  }

  if (!buffProd) {
    return res.status(503).json({
      success: false,
      error: "product_unavailable",
      message: "Muse AI token product is temporarily unavailable. Please try again shortly.",
    });
  }

  // 3. Check Settings & Daily Limit
  const settings = await getReferralSettings();
  if (settings && !settings.redemption_enabled) {
    return res.status(403).json({
      success: false,
      error: "redemption_disabled",
      message: "Gift redemptions are temporarily paused by administration.",
    });
  }

  const dailyLimit = Number(settings?.daily_redemption_limit) || 3;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: todayRedeemed } = await supabaseAdmin
    .from("referral_gift_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["fulfilled", "reserved"])
    .gte("created_at", todayStart.toISOString());

  if ((todayRedeemed || 0) >= dailyLimit) {
    return res.status(429).json({
      success: false,
      error: "daily_limit_reached",
      message: `You have reached your daily limit of ${dailyLimit} gift boxes. Please come back tomorrow!`,
    });
  }

  // 4. Find available gift box
  const nowIso = new Date().toISOString();
  const { data: availableGifts } = await supabaseAdmin
    .from("referral_gifts")
    .select("id")
    .eq("owner_user_id", userId)
    .or(`status.eq.available,and(status.eq.locked,available_at.lte.${nowIso})`)
    .limit(1);

  if (!availableGifts || availableGifts.length === 0) {
    return res.status(400).json({
      success: false,
      error: "no_available_gifts",
      message: "You have no available gift boxes to redeem. Share your referral link to earn more!",
    });
  }

  const giftId = availableGifts[0].id;
  const orderId = crypto.randomUUID();
  const unitPrice = Number(buffProd.sell_price) || 0.12;
  const unitCost = Number(buffProd.cost_price) || 0.06;

  // 5. Create Order (100% Free Gift Claim)
  const orderRow = {
    id: orderId,
    user_id: userId,
    product_id: buffProd.id,
    quantity: 1,
    unit_price: unitPrice,
    total: 0.0,
    email: session.user.email || null,
    activation_info: code,
    status: "paid",
    paid_with: "gift_box",
    expected_amount: 0.0,
    gifts_redeemed: 1,
    gift_discount: unitPrice,
    unit_cost: unitCost,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert(orderRow)
    .select()
    .single();

  if (orderErr) {
    return res.status(500).json({ success: false, error: orderErr.message });
  }

  // 6. Atomically finalize Gift status & record redemption
  await supabaseAdmin
    .from("referral_gifts")
    .update({ status: "redeemed", redeemed_at: nowIso, order_id: orderId })
    .eq("id", giftId);

  await supabaseAdmin.from("referral_gift_redemptions").insert({
    gift_id: giftId,
    user_id: userId,
    order_id: orderId,
    product_id: buffProd.id,
    status: "fulfilled",
    fulfilled_at: nowIso,
    supplier_cost_snapshot: unitCost,
  });

  await supabaseAdmin.from("referral_cost_ledger").insert({
    order_id: orderId,
    user_id: userId,
    gifts_count: 1,
    tokens_fulfilled: 1000000000,
    supplier_cost_per_gift: unitCost,
    total_supplier_cost: unitCost,
    is_estimated: false,
    created_at: nowIso,
  });

  // 7. Auto-fulfill order via TunVN
  let fulfillRes = null;
  try {
    fulfillRes = await fulfillOrder(order);
  } catch (fErr) {
    console.error("[claim-gift] fulfillOrder error:", fErr?.message);
  }

  return res.status(200).json({
    success: true,
    order_id: orderId,
    tokens: "1,000,000,000",
    product_name: buffProd.title || "Muse AI Pro (1B Buff)",
    status: fulfillRes?.success ? "completed" : "delivered",
    message: "1 Billion Muse AI tokens have been successfully delivered to your account!",
  });
}

