import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { validateRegistrationEmail } from "../../../lib/emailAllowlist";
import { getReferralSettings } from "../../../lib/referralSettings";
import { checkEntityBanned, banEntity } from "../../../lib/bannedEntities";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { username, email, password, ref, device_id } = req.body || {};

  // 1. Username validation
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) {
    return res.status(400).json({ success: false, error: "Username is required." });
  }

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
    return res.status(400).json({
      success: false,
      error: "Username must be 3–24 characters and can only contain letters, numbers, and underscores (_).",
    });
  }

  // Check username uniqueness (case-insensitive)
  const { data: existingUser } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("username", cleanUsername)
    .maybeSingle();

  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: "This username is already taken. Please choose another.",
    });
  }

  // 2. Email domain allowlist validation
  const emailCheck = validateRegistrationEmail(email);
  if (!emailCheck.valid) {
    return res.status(400).json({ success: false, error: emailCheck.error });
  }

  // Check email uniqueness
  const { data: existingEmail } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", emailCheck.normalizedEmail)
    .maybeSingle();

  if (existingEmail) {
    return res.status(400).json({
      success: false,
      error: "An account with this email address already exists. Please log in instead.",
    });
  }

  // 3. Password validation: Allow any password chosen by user
  if (!password || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      error: "Password is required.",
    });
  }

  // 4. Fetch anti-fraud settings & Admin Whitelist
  const settings = await getReferralSettings();
  const maxDeviceAccounts = Number(settings?.fraud_max_accounts_per_device) || 2;
  const maxIpAccounts = Number(settings?.fraud_max_accounts_per_ip) || 3;

  const cleanDeviceId = String(device_id || "").trim();
  const clientIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "";

  // Check if current IP or Device is whitelisted by Admin (e.g. for testing)
  let isWhitelisted = false;
  let whitelistIps = [];
  let whitelistDevices = [];
  try {
    const { data: metaRows } = await supabaseAdmin
      .from("app_meta")
      .select("key, value")
      .in("key", ["admin_whitelist_ips", "admin_whitelist_devices"]);

    const metaMap = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));
    whitelistIps = (metaMap.admin_whitelist_ips || "")
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    whitelistDevices = (metaMap.admin_whitelist_devices || "")
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (clientIp && whitelistIps.some((w) => w.toLowerCase() === clientIp.toLowerCase())) {
      isWhitelisted = true;
    }
    if (cleanDeviceId && whitelistDevices.some((w) => w.toLowerCase() === cleanDeviceId.toLowerCase())) {
      isWhitelisted = true;
    }
  } catch (err) {
    console.warn("[validate-signup] whitelist check warn:", err.message);
  }

  // 4b. Explicit Ban Check (unless whitelisted)
  if (!isWhitelisted) {
    try {
      const banCheck = await checkEntityBanned({
        ip: clientIp,
        deviceId: cleanDeviceId,
        whitelistIps,
        whitelistDevices,
      });

      if (banCheck.banned) {
        if (banCheck.type === "device") {
          return res.status(403).json({
            success: false,
            code: "DEVICE_BANNED",
            error: "This mobile/device has been blocked by the administrator. Multiple accounts from the same mobile are not allowed.",
          });
        }
        if (banCheck.type === "ip") {
          return res.status(403).json({
            success: false,
            code: "IP_BANNED",
            error: "This IP address has been blocked by the administrator. Multiple accounts from this IP network are not allowed.",
          });
        }
      }
    } catch (banErr) {
      console.warn("[validate-signup] banCheck error:", banErr?.message);
    }
  }

  // 5. Anti-Fraud Check: Device Registration Cap (Bypassed if whitelisted)
  if (!isWhitelisted && cleanDeviceId) {
    try {
      const { count: deviceCount } = await supabaseAdmin
        .from("device_registrations")
        .select("id", { count: "exact", head: true })
        .eq("device_id", cleanDeviceId);

      if (typeof deviceCount === "number" && deviceCount >= maxDeviceAccounts) {
        // Auto-record this device in banned list so it shows in Admin Panel
        try {
          await banEntity({
            type: "device",
            value: cleanDeviceId,
            reason: `Exceeded device limit (${deviceCount}/${maxDeviceAccounts} accounts created from this mobile)`,
            bannedBy: "system",
          });
        } catch {}

        return res.status(400).json({
          success: false,
          code: "DEVICE_LIMIT_EXCEEDED",
          error: "Multiple accounts from the same mobile/device are not allowed. Please log in to your existing account.",
        });
      }
    } catch (e) {
      console.warn("[validate-signup] device check error:", e.message);
    }
  }

  // 6. Anti-Fraud Check: IP Registration Cap (Bypassed if whitelisted)
  if (!isWhitelisted && clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1") {
    try {
      const { count: ipCount } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("registration_ip", clientIp);

      if (typeof ipCount === "number" && ipCount >= maxIpAccounts) {
        // Auto-record this IP in banned list so it shows in Admin Panel
        try {
          await banEntity({
            type: "ip",
            value: clientIp,
            reason: `Exceeded IP limit (${ipCount}/${maxIpAccounts} accounts created from this IP)`,
            bannedBy: "system",
          });
        } catch {}

        return res.status(400).json({
          success: false,
          code: "IP_LIMIT_EXCEEDED",
          error: "Account registration limit reached for this IP/network. Multiple accounts are not allowed. Please log in.",
        });
      }
    } catch (e) {
      console.warn("[validate-signup] ip check error:", e.message);
    }
  }

  // 7. Resolve inviter if referral code is present & Anti-Self-Referral
  let inviter = null;
  const cleanRef = String(ref || "").trim();
  if (cleanRef) {
    // Prevent self-referral by username
    if (cleanRef.toLowerCase() === cleanUsername.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: "You cannot refer yourself.",
      });
    }

    const { data: inviterProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, username, device_id")
      .ilike("username", cleanRef)
      .maybeSingle();

    if (inviterProfile) {
      // Check if trying to refer oneself on the exact same device (bypassed if whitelisted)
      if (!isWhitelisted && cleanDeviceId && inviterProfile.device_id && inviterProfile.device_id === cleanDeviceId) {
        return res.status(400).json({
          success: false,
          code: "SAME_DEVICE_REFERRAL",
          error: "Self-referral is not allowed. You cannot register using your own referral link on the same mobile/device.",
        });
      }

      inviter = { id: inviterProfile.id, username: inviterProfile.username };
    }
  }

  return res.status(200).json({
    success: true,
    cleanUsername: cleanUsername.toLowerCase(),
    cleanEmail: emailCheck.normalizedEmail,
    inviter,
    clientIp,
  });
}
