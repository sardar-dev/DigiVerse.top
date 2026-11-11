import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  if (!session) {
    return res.status(200).json({ success: true, logged_in: false, available_gifts: 0 });
  }

  const productId = req.query?.product_id || req.body?.product_id;
  if (!productId) {
    return res.status(400).json({ success: false, error: "product_id_required" });
  }

  // 1. Check if product is Muse AI buff token
  const { data: prod } = await supabaseAdmin
    .from("products")
    .select("id, tunvn_buff, sell_price")
    .eq("id", productId)
    .maybeSingle();

  if (!prod || !prod.tunvn_buff) {
    return res.status(200).json({
      success: true,
      eligible: false,
      available_gifts: 0,
      reason: "not_muse_ai_buff",
    });
  }

  // 2. Check system settings & master redemption switch
  const { data: settings } = await supabaseAdmin
    .from("referral_settings")
    .select("redemption_enabled, daily_redemption_limit")
    .eq("id", 1)
    .single();

  if (!settings || !settings.redemption_enabled) {
    return res.status(200).json({
      success: true,
      eligible: false,
      available_gifts: 0,
      reason: "redemption_disabled",
    });
  }

  // 3. Count user's available gifts (lazy check)
  const now = new Date().toISOString();
  const { count: availableGifts } = await supabaseAdmin
    .from("referral_gifts")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", session.user.id)
    .or(`status.eq.available,and(status.eq.locked,available_at.lte.${now})`);

  // 4. Count user's today redeemed gifts
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: todayRedeemed } = await supabaseAdmin
    .from("referral_gift_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .in("status", ["fulfilled", "reserved"])
    .gte("created_at", todayStart.toISOString());

  const dailyLimit = settings.daily_redemption_limit || 3;
  const remainingToday = Math.max(0, dailyLimit - (todayRedeemed || 0));
  const maxRedeemable = Math.min(availableGifts || 0, remainingToday);

  return res.status(200).json({
    success: true,
    eligible: true,
    available_gifts: availableGifts || 0,
    daily_limit: dailyLimit,
    remaining_today: remainingToday,
    max_redeemable: maxRedeemable,
    unit_price: Number(prod.sell_price),
  });
}

