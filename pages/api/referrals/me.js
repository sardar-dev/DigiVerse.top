import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getReferralSettings } from "../../../lib/referralSettings";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  if (!session) {
    return res.status(401).json({ success: false, error: "login_required" });
  }

  const userId = session.user.id;

  // Handle setting username for older users who don't have one
  if (req.method === "POST" && req.body?.username) {
    const rawUser = String(req.body.username).trim().toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(rawUser)) {
      return res.status(400).json({
        success: false,
        error: "Username must be 3–24 characters and only contain letters, numbers, and underscores.",
      });
    }

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", rawUser)
      .neq("id", userId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, error: "This username is already taken." });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ username: rawUser })
      .eq("id", userId);

    if (updateErr) {
      return res.status(500).json({ success: false, error: updateErr.message });
    }
  }

  // 1. Fetch user profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, username, balance, referred_by, created_at")
    .eq("id", userId)
    .single();

  // 1b. Auto-reconciliation: ensure referral records & gifts exist for all qualified referrals
  try {
    const settings = await getReferralSettings();
    const requireEmail = settings?.require_email_verification === true;

    // If user was referred by someone (stored in profiles.referred_by), ensure public.referrals has the record
    if (profile?.referred_by && profile.referred_by !== userId) {
      const { data: existingUserRef } = await supabaseAdmin
        .from("referrals")
        .select("id, status")
        .eq("referred_id", userId)
        .maybeSingle();

      if (!existingUserRef) {
        const { data: inviterProf } = await supabaseAdmin
          .from("profiles")
          .select("username")
          .eq("id", profile.referred_by)
          .maybeSingle();

        await supabaseAdmin.from("referrals").insert({
          referrer_id: profile.referred_by,
          referred_id: userId,
          referrer_username: inviterProf?.username || "referrer",
          status: requireEmail ? "pending_verification" : "qualified",
          reward_issued: !requireEmail,
          created_at: profile.created_at || new Date().toISOString(),
          verified_at: requireEmail ? null : (profile.created_at || new Date().toISOString()),
        });
      }
    }

    const { data: userRefs } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_id, referred_id, status, reward_issued, created_at")
      .or(`referrer_id.eq.${userId},referred_id.eq.${userId}`);

    for (const ref of userRefs || []) {
      // Auto-qualify if email verification is not required
      if (!requireEmail && ref.status === "pending_verification") {
        await supabaseAdmin
          .from("referrals")
          .update({
            status: "qualified",
            reward_issued: true,
            verified_at: ref.created_at || new Date().toISOString(),
          })
          .eq("id", ref.id);
        ref.status = "qualified";
      }

      if (ref.status === "qualified" || ref.status === "pending_verification") {
        const { data: existingGift } = await supabaseAdmin
          .from("referral_gifts")
          .select("id")
          .eq("owner_user_id", userId)
          .eq("referral_record_id", ref.id)
          .maybeSingle();

        if (!existingGift) {
          await supabaseAdmin.from("referral_gifts").insert({
            owner_user_id: userId,
            referrer_user_id: ref.referrer_id,
            referred_user_id: ref.referred_id,
            referral_record_id: ref.id,
            reward_type: "muse_ai_tokens",
            reward_quantity: 1000000000,
            status: "available",
            created_at: ref.created_at || new Date().toISOString(),
            available_at: ref.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch (reconcileErr) {
    console.warn("[referrals/me] gift reconciliation note:", reconcileErr?.message);
  }

  // 2. Fetch stats via atomic RPC function (with graceful fallback)
  let rpcStats = null;
  try {
    const { data, error } = await supabaseAdmin.rpc("get_user_gift_wallet_stats", {
      p_user_id: userId,
    });
    if (!error && data) rpcStats = data;
  } catch {}

  // 3. Fetch gift wallet records
  const { data: gifts } = await supabaseAdmin
    .from("referral_gifts")
    .select("id, reward_type, reward_quantity, status, created_at, available_at, redeemed_at, order_id, revoked_reason")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  // 4. Fetch referrals history (invited users)
  const { data: rawReferrals } = await supabaseAdmin
    .from("referrals")
    .select("id, referred_id, status, reward_issued, created_at, verified_at")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });

  // Get usernames for invited users for clean privacy display
  const referredIds = (rawReferrals || []).map((r) => r.referred_id);
  let referredUsernames = {};
  if (referredIds.length > 0) {
    const { data: refProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, email")
      .in("id", referredIds);

    const foundIds = new Set((refProfiles || []).map((p) => p.id));
    (refProfiles || []).forEach((p) => {
      if (p.username) {
        referredUsernames[p.id] = p.username;
      } else if (p.email) {
        const [u, d] = p.email.split("@");
        referredUsernames[p.id] = `${u.slice(0, 3)}***@${d}`;
      }
    });

    // For any user whose username/email wasn't in profiles, check auth.users
    const missingIds = referredIds.filter((id) => !foundIds.has(id) || !referredUsernames[id]);
    for (const mId of missingIds) {
      try {
        const { data: authU } = await supabaseAdmin.auth.admin.getUserById(mId);
        if (authU?.user) {
          const uName = authU.user.user_metadata?.username;
          const uEmail = authU.user.email;
          if (uName) {
            referredUsernames[mId] = uName;
          } else if (uEmail) {
            const [u, d] = uEmail.split("@");
            referredUsernames[mId] = `${u.slice(0, 3)}***@${d}`;
          }
        }
      } catch {}
    }
  }

  const referrals = (rawReferrals || []).map((r) => ({
    ...r,
    displayName: referredUsernames[r.referred_id] || "Friend",
  }));

  // 5. System settings
  const settings = await getReferralSettings();

  // 6. Reliable live calculation of stats
  const now = new Date();
  const giftList = gifts || [];
  const totalEarned = giftList.filter((g) => g.status !== "revoked").length;
  const availableCount = giftList.filter((g) => {
    if (g.status === "available") return true;
    if (g.status === "locked" && g.available_at && new Date(g.available_at) <= now) return true;
    return false;
  }).length;
  const lockedCount = giftList.filter((g) => {
    return g.status === "locked" && g.available_at && new Date(g.available_at) > now;
  }).length;
  const redeemedCount = giftList.filter((g) => g.status === "redeemed").length;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  let todayRedeemedCount = 0;
  try {
    const { count } = await supabaseAdmin
      .from("referral_gift_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["fulfilled", "reserved"])
      .gte("created_at", todayStart.toISOString());
    todayRedeemedCount = count || 0;
  } catch {}

  const dailyLimit = Number(settings?.daily_redemption_limit) || 3;
  const maxLifetime = Number(settings?.max_lifetime_gifts) || 15;
  const remainingToday = Math.max(0, dailyLimit - todayRedeemedCount);

  // Closest locked countdown in seconds
  let nextUnlockSec = 0;
  const lockedGifts = giftList.filter((g) => g.status === "locked" && g.available_at && new Date(g.available_at) > now);
  if (lockedGifts.length > 0) {
    const earliest = Math.min(...lockedGifts.map((g) => new Date(g.available_at).getTime()));
    nextUnlockSec = Math.max(0, Math.ceil((earliest - now.getTime()) / 1000));
  }

  const computedStats = {
    total_earned: totalEarned,
    max_lifetime_gifts: maxLifetime,
    available_count: availableCount,
    locked_count: lockedCount,
    redeemed_count: redeemedCount,
    daily_limit: dailyLimit,
    remaining_today: remainingToday,
    next_unlock_seconds: nextUnlockSec,
  };

  const finalStats = {
    ...computedStats,
    ...(rpcStats || {}),
    // Ensure accurate counts from live gift rows if RPC returned 0 but gifts exist
    ...(totalEarned > 0 ? {
      total_earned: Math.max(totalEarned, Number(rpcStats?.total_earned || 0)),
      available_count: Math.max(availableCount, Number(rpcStats?.available_count || 0)),
    } : {}),
  };

  return res.status(200).json({
    success: true,
    profile,
    stats: finalStats,
    gifts: gifts || [],
    referrals: referrals || [],
    settings: settings || {},
  });
}

