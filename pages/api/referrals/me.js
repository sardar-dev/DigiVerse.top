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
    .select("id, email, username, balance, created_at")
    .eq("id", userId)
    .single();

  // 2. Fetch stats via atomic RPC function
  const { data: stats, error: statsErr } = await supabaseAdmin.rpc("get_user_gift_wallet_stats", {
    p_user_id: userId,
  });

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

    (refProfiles || []).forEach((p) => {
      // Show username or masked email for privacy
      if (p.username) {
        referredUsernames[p.id] = p.username;
      } else if (p.email) {
        const [u, d] = p.email.split("@");
        referredUsernames[p.id] = `${u.slice(0, 3)}***@${d}`;
      } else {
        referredUsernames[p.id] = "User";
      }
    });
  }

  const referrals = (rawReferrals || []).map((r) => ({
    ...r,
    displayName: referredUsernames[r.referred_id] || "Invited User",
  }));

  // 5. System settings
  const settings = await getReferralSettings();

  return res.status(200).json({
    success: true,
    profile,
    stats: stats || {},
    gifts: gifts || [],
    referrals: referrals || [],
    settings: settings || {},
  });
}

