import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getReferralSettings } from "../../../lib/referralSettings";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  let userId = null;

  // 1. Try session first
  try {
    const supabaseServer = createPagesServerClient({ req, res });
    const {
      data: { session },
    } = await supabaseServer.auth.getSession();
    if (session?.user?.id) {
      userId = session.user.id;
    }
  } catch {}

  // 2. Fallback to payload user_id (e.g. called right after signup before email confirmation)
  if (!userId && req.body?.user_id) {
    userId = String(req.body.user_id).trim();
  }

  if (!userId) {
    return res.status(401).json({ success: false, error: "login_required" });
  }

  // Verify user exists directly from auth.users
  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    return res.status(404).json({ success: false, error: "user_not_found" });
  }

  // Ensure public.profiles record always exists for this user immediately
  try {
    const rawUsername =
      req.body?.username ||
      authUser.user.user_metadata?.username ||
      (authUser.user.email ? authUser.user.email.split("@")[0] : `user_${userId.slice(0, 5)}`);
    const cleanUsername = rawUsername.toLowerCase().trim();

    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email: authUser.user.email || req.body?.email || null,
        username: cleanUsername,
        device_id: req.body?.device_id || authUser.user.user_metadata?.device_id || null,
        registration_ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || null,
        created_at: authUser.user.created_at || new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (e) {
    console.warn("[referrals/qualify] ensure profile error:", e.message);
  }

  const clientIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "";

  // Check Admin Whitelist
  let isWhitelisted = false;
  try {
    const { data: metaRows } = await supabaseAdmin
      .from("app_meta")
      .select("key, value")
      .in("key", ["admin_whitelist_ips", "admin_whitelist_devices"]);

    const metaMap = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));
    const whitelistIps = (metaMap.admin_whitelist_ips || "").toLowerCase();
    const whitelistDevices = (metaMap.admin_whitelist_devices || "").toLowerCase();

    const devId = (req.body?.device_id || authUser.user.user_metadata?.device_id || "").toLowerCase();

    if (clientIp && whitelistIps.includes(clientIp.toLowerCase())) isWhitelisted = true;
    if (devId && whitelistDevices.includes(devId)) isWhitelisted = true;
  } catch {}

  // Check if referral record exists in public.referrals
  const { data: existingRef } = await supabaseAdmin
    .from("referrals")
    .select("id, status")
    .eq("referred_id", userId)
    .maybeSingle();

  if (!existingRef) {
    const rawRef = (
      req.body?.ref ||
      authUser.user.user_metadata?.ref ||
      ""
    ).toString().trim().replace(/^@+/, "");

    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, referred_by, device_id, registration_ip")
      .eq("id", userId)
      .maybeSingle();

    let inviterId = userProfile?.referred_by;
    let inviterUsername = rawRef;

    if (!inviterId && rawRef) {
      const { data: inviterProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .ilike("username", rawRef)
        .neq("id", userId)
        .maybeSingle();

      if (inviterProfile) {
        inviterId = inviterProfile.id;
        inviterUsername = inviterProfile.username;
        await supabaseAdmin
          .from("profiles")
          .update({ referred_by: inviterId })
          .eq("id", userId);
      }
    }

    if (inviterId) {
      await supabaseAdmin.from("referrals").insert({
        referrer_id: inviterId,
        referred_id: userId,
        referrer_username: inviterUsername,
        device_id: userProfile?.device_id || authUser.user.user_metadata?.device_id || req.body?.device_id || null,
        registration_ip: userProfile?.registration_ip || authUser.user.user_metadata?.registration_ip || clientIp || null,
        status: "pending_verification",
      });
    }
  }

  // Check if email verification is required by admin settings
  const settings = await getReferralSettings();
  const requireEmail = settings?.require_email_verification !== false;

  // If email verification is required, user is not confirmed yet, and not whitelisted
  if (requireEmail && !authUser.user.email_confirmed_at && !isWhitelisted) {
    return res.status(200).json({
      success: true,
      pending_email: true,
      message: "Referral recorded as pending. Rewards will unlock once email is confirmed.",
    });
  }

  // Call the atomic PostgreSQL RPC function (Dual Gift Reward)
  const { data, error } = await supabaseAdmin.rpc("qualify_referral", {
    p_referred_user_id: userId,
  });

  if (error) {
    console.error("[referrals/qualify] RPC error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(200).json({ success: true, result: data });
}
