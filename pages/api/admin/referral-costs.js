import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import * as tunvn from "../../../lib/suppliers/tunvn";
import { getReferralSettings } from "../../../lib/referralSettings";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // 1. Live TunVN Supplier Balance
  let tunvnWallet = { balance: null, configured: false, error: null };
  if (tunvn.configured()) {
    tunvnWallet.configured = true;
    try {
      const balRes = await tunvn.getBalance();
      tunvnWallet.balance = balRes?.balance ?? null;
    } catch (e) {
      tunvnWallet.error = e.message;
    }
  }

  // 2. Settings & Cost config
  const settings = await getReferralSettings();
  const currentSupplierCost = Number(settings?.supplier_cost_per_gift || 0.06);

  // 2.5 Auto-reconciliation of gift orders & redemptions
  const nowIso = new Date().toISOString();
  let totalRedeemedFromOrders = 0;
  const userIdsWithRedeemedOrders = new Set();

  try {
    const { data: giftOrders } = await supabaseAdmin
      .from("orders")
      .select("id, status, total, gifts_redeemed, user_id, product_id, created_at, products(cost_price)")
      .gt("gifts_redeemed", 0)
      .neq("status", "cancelled");

    for (const ord of giftOrders || []) {
      const gCount = Number(ord.gifts_redeemed || 1);
      totalRedeemedFromOrders += gCount;
      if (ord.user_id) userIdsWithRedeemedOrders.add(ord.user_id);

      // If free order was stuck in pending_payment, advance it to paid
      if (ord.status === "pending_payment" && Number(ord.total || 0) <= 0) {
        await supabaseAdmin
          .from("orders")
          .update({ status: "paid", paid_with: "gift_box", updated_at: nowIso })
          .eq("id", ord.id);
        ord.status = "paid";
      }

      // Mark gifts for this order as redeemed
      await supabaseAdmin
        .from("referral_gifts")
        .update({ status: "redeemed", redeemed_at: nowIso, order_id: ord.id })
        .or(`order_id.eq.${ord.id},and(owner_user_id.eq.${ord.user_id},status.eq.reserved)`);

      // Mark redemptions as fulfilled
      await supabaseAdmin
        .from("referral_gift_redemptions")
        .update({ status: "fulfilled", fulfilled_at: nowIso, order_id: ord.id })
        .or(`order_id.eq.${ord.id},and(user_id.eq.${ord.user_id},status.eq.reserved)`);

      // Try invoking database RPC
      try {
        await supabaseAdmin.rpc("finalize_gift_redemption", {
          p_order_id: ord.id,
          p_actual_cost: ord.products?.cost_price ? Number(ord.products.cost_price) : null,
        });
      } catch {}

      // Ensure cost ledger entry exists
      const { data: existingLedger } = await supabaseAdmin
        .from("referral_cost_ledger")
        .select("id")
        .eq("order_id", ord.id)
        .maybeSingle();

      if (!existingLedger && ord.user_id) {
        const costPerGift = currentSupplierCost;
        await supabaseAdmin.from("referral_cost_ledger").insert({
          order_id: ord.id,
          user_id: ord.user_id,
          gifts_count: gCount,
          tokens_fulfilled: gCount * 1000000000,
          supplier_cost_per_gift: costPerGift,
          total_supplier_cost: Number((gCount * costPerGift).toFixed(2)),
          is_estimated: false,
          created_at: ord.created_at || nowIso,
        });
      }
    }
  } catch (syncErr) {
    console.warn("[referral-costs] auto-reconcile note:", syncErr?.message);
  }

  // 3. Overall referral counts

  const [
    { count: totalReferred },
    { count: totalQualified },
    { count: totalGiftsAwarded },
    { count: totalGiftsLocked },
    { count: totalGiftsAvailable },
    { count: totalGiftsRedeemed },
    { count: totalGiftsRevoked },
  ] = await Promise.all([
    supabaseAdmin.from("referrals").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("referrals").select("id", { count: "exact", head: true }).in("status", ["qualified", "qualified_cap_reached"]),
    supabaseAdmin.from("referral_gifts").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("referral_gifts").select("id", { count: "exact", head: true }).eq("status", "locked").gt("available_at", nowIso),
    supabaseAdmin.from("referral_gifts").select("id", { count: "exact", head: true }).or(`status.eq.available,and(status.eq.locked,available_at.lte.${nowIso})`),
    supabaseAdmin.from("referral_gifts").select("id", { count: "exact", head: true }).eq("status", "redeemed"),
    supabaseAdmin.from("referral_gifts").select("id", { count: "exact", head: true }).eq("status", "revoked"),
  ]);

  // 4. Actual spent cost from ledger
  const { data: ledgerEntries } = await supabaseAdmin
    .from("referral_cost_ledger")
    .select("total_supplier_cost, gifts_count, tokens_fulfilled, user_id, created_at");

  let totalActualSpent = 0;
  let totalFreeTokensFulfilled = 0;
  const usersWhoRedeemed = new Set();
  const perUserCost = {};

  (ledgerEntries || []).forEach((row) => {
    const cost = Number(row.total_supplier_cost || 0);
    const tokens = Number(row.tokens_fulfilled || 0);
    totalActualSpent += cost;
    totalFreeTokensFulfilled += tokens;
    if (row.user_id) {
      usersWhoRedeemed.add(row.user_id);
      perUserCost[row.user_id] = (perUserCost[row.user_id] || 0) + cost;
    }
  });

  const effectiveGiftsRedeemed = Math.max(totalGiftsRedeemed || 0, totalRedeemedFromOrders);
  const outstandingGiftsCount = Math.max(0, (totalGiftsLocked || 0) + (totalGiftsAvailable || 0) - (effectiveGiftsRedeemed - (totalGiftsRedeemed || 0)));
  const totalOutstandingLiability = Number((outstandingGiftsCount * currentSupplierCost).toFixed(2));

  // 5. Per-User Cost & Referral Report
  // Load profiles of users who either made referrals or earned/redeemed gifts
  const { data: activeProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, username, email, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  // Group user statistics
  const { data: allReferrals } = await supabaseAdmin
    .from("referrals")
    .select("referrer_id, status");

  const { data: allGifts } = await supabaseAdmin
    .from("referral_gifts")
    .select("owner_user_id, status");

  const userStatsMap = {};

  (allReferrals || []).forEach((r) => {
    if (!r.referrer_id) return;
    if (!userStatsMap[r.referrer_id]) userStatsMap[r.referrer_id] = { referrals: 0, qualified: 0, earned: 0, redeemed: 0 };
    userStatsMap[r.referrer_id].referrals += 1;
    if (r.status === "qualified" || r.status === "qualified_cap_reached") {
      userStatsMap[r.referrer_id].qualified += 1;
    }
  });

  (allGifts || []).forEach((g) => {
    if (!g.owner_user_id) return;
    if (!userStatsMap[g.owner_user_id]) userStatsMap[g.owner_user_id] = { referrals: 0, qualified: 0, earned: 0, redeemed: 0 };
    if (g.status !== "revoked") userStatsMap[g.owner_user_id].earned += 1;
    if (g.status === "redeemed" || g.status === "reserved") userStatsMap[g.owner_user_id].redeemed += 1;
  });

  // Ensure any user who redeemed via order has their redeemed count updated in userStatsMap
  userIdsWithRedeemedOrders.forEach((uid) => {
    if (!userStatsMap[uid]) userStatsMap[uid] = { referrals: 0, qualified: 0, earned: 0, redeemed: 0 };
    if (userStatsMap[uid].redeemed === 0) userStatsMap[uid].redeemed = 1;
    if (userStatsMap[uid].earned < userStatsMap[uid].redeemed) userStatsMap[uid].earned = userStatsMap[uid].redeemed;
  });

  const userReports = (activeProfiles || [])
    .map((p) => {
      const s = userStatsMap[p.id] || { referrals: 0, qualified: 0, earned: 0, redeemed: 0 };
      const costSpent = perUserCost[p.id] || (s.redeemed * currentSupplierCost);
      return {
        user_id: p.id,
        username: p.username || "—",
        email: p.email || "—",
        referrals_count: s.referrals,
        qualified_count: s.qualified,
        gifts_earned: s.earned,
        gifts_redeemed: s.redeemed,
        free_tokens_delivered: `${s.redeemed}B`,
        actual_cost_incurred: Number(costSpent.toFixed(2)),
        created_at: p.created_at,
      };
    })
    .filter((u) => u.referrals_count > 0 || u.gifts_earned > 0 || u.gifts_redeemed > 0);

  // 6. Cost History records
  const { data: costHistory } = await supabaseAdmin
    .from("supplier_cost_history")
    .select("*")
    .order("effective_from", { ascending: false })
    .limit(20);

  return res.status(200).json({
    success: true,
    tunvn_wallet: tunvnWallet,
    current_supplier_cost: currentSupplierCost,
    analytics: {
      total_referred_users: totalReferred || 0,
      total_qualified_referrals: totalQualified || 0,
      total_gifts_awarded: Math.max(totalGiftsAwarded || 0, effectiveGiftsRedeemed),
      total_gifts_locked: totalGiftsLocked || 0,
      total_gifts_available: Math.max(0, (totalGiftsAvailable || 0) - (effectiveGiftsRedeemed - (totalGiftsRedeemed || 0))),
      total_gifts_redeemed: effectiveGiftsRedeemed,
      total_gifts_revoked: totalGiftsRevoked || 0,
      total_free_tokens_delivered: `${Math.max(effectiveGiftsRedeemed, Math.round(totalFreeTokensFulfilled / 1000000000))}B`,
      total_outstanding_liability: totalOutstandingLiability,
      total_actual_spent: Number((Math.max(totalActualSpent, effectiveGiftsRedeemed * currentSupplierCost)).toFixed(2)),
      total_users_redeemed: Math.max(usersWhoRedeemed.size, userIdsWithRedeemedOrders.size),
    },
    user_reports: userReports,
    cost_history: costHistory || [],
  });
}

