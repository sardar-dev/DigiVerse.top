import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import * as tunvn from "../../../lib/suppliers/tunvn";

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
  const { data: settings } = await supabaseAdmin
    .from("referral_settings")
    .select("*")
    .eq("id", 1)
    .single();

  const currentSupplierCost = Number(settings?.supplier_cost_per_gift || 0.06);

  // 3. Overall referral counts
  const nowIso = new Date().toISOString();

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

  // Outstanding gift liability = (locked + available gifts) * currentSupplierCost
  const outstandingGiftsCount = (totalGiftsLocked || 0) + (totalGiftsAvailable || 0);
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
    if (g.status === "redeemed") userStatsMap[g.owner_user_id].redeemed += 1;
  });

  const userReports = (activeProfiles || [])
    .map((p) => {
      const s = userStatsMap[p.id] || { referrals: 0, qualified: 0, earned: 0, redeemed: 0 };
      const costSpent = perUserCost[p.id] || 0;
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
      total_gifts_awarded: totalGiftsAwarded || 0,
      total_gifts_locked: totalGiftsLocked || 0,
      total_gifts_available: totalGiftsAvailable || 0,
      total_gifts_redeemed: totalGiftsRedeemed || 0,
      total_gifts_revoked: totalGiftsRevoked || 0,
      total_free_tokens_delivered: `${totalGiftsRedeemed || 0}B`,
      total_outstanding_liability: totalOutstandingLiability,
      total_actual_spent: Number(totalActualSpent.toFixed(2)),
      total_users_redeemed: usersWhoRedeemed.size,
    },
    user_reports: userReports,
    cost_history: costHistory || [],
  });
}

