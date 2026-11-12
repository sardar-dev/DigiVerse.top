import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { getReferralSettings, updateReferralSettings } from "../../../lib/referralSettings";
import { getBannedEntities, banEntity, unbanEntity, clearAllPastBans } from "../../../lib/bannedEntities";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  // GET — Load referral settings, referral registrations list, gifts list, and banned entities
  if (req.method === "GET") {
    const [settings, { data: referralsRaw }, { data: giftsRaw }, { data: metaRows }, explicitBanned] = await Promise.all([
      getReferralSettings(),
      supabaseAdmin
        .from("referrals")
        .select("id, referrer_id, referred_id, referrer_username, status, device_id, registration_ip, suspicious_reason, reward_issued, verified_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("referral_gifts")
        .select("id, owner_user_id, referrer_user_id, referred_user_id, reward_type, reward_quantity, status, created_at, available_at, redeemed_at, order_id, revoked_at, revoked_reason")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("app_meta")
        .select("key, value")
        .in("key", ["admin_whitelist_ips", "admin_whitelist_devices", "banned_system_started_at"]),
      getBannedEntities(),
    ]);

    const metaMap = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));
    const currentAdminIp =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "";

    // Gather usernames and emails for referred and referrer users
    const userIds = new Set();
    (referralsRaw || []).forEach((r) => {
      if (r.referrer_id) userIds.add(r.referrer_id);
      if (r.referred_id) userIds.add(r.referred_id);
    });
    (giftsRaw || []).forEach((g) => {
      if (g.owner_user_id) userIds.add(g.owner_user_id);
      if (g.referred_user_id) userIds.add(g.referred_user_id);
    });

    const userMap = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, username, email")
        .in("id", Array.from(userIds));

      (profiles || []).forEach((p) => {
        userMap[p.id] = { username: p.username || "—", email: p.email || "—" };
      });
    }

    const referrals = (referralsRaw || []).map((r) => ({
      ...r,
      referrer_name: userMap[r.referrer_id]?.username || r.referrer_username || "—",
      referred_name: userMap[r.referred_id]?.username || "—",
      referred_email: userMap[r.referred_id]?.email || "—",
    }));

    const gifts = (giftsRaw || []).map((g) => ({
      ...g,
      owner_name: userMap[g.owner_user_id]?.username || "—",
      owner_email: userMap[g.owner_user_id]?.email || "—",
      referred_name: userMap[g.referred_user_id]?.username || "—",
    }));

    // Calculate flagged referrals
    const flaggedList = referrals.filter((r) => r.status === "flagged_suspicious");
    const uniqueFlaggedIps = Array.from(new Set(flaggedList.map((r) => r.registration_ip).filter(Boolean)));
    const uniqueFlaggedDevices = Array.from(new Set(flaggedList.map((r) => r.device_id).filter(Boolean)));

    // Build unified banned entities list
    const bannedMap = new Map();
    // 1. Add explicit bans from app_meta
    (explicitBanned || []).forEach((b) => {
      const key = `${b.type}:${b.value.toLowerCase()}`;
      bannedMap.set(key, { ...b, accounts: [] });
    });

    // 2. Add any IP or Device from flagged referrals not yet listed
    flaggedList.forEach((r) => {
      if (r.registration_ip) {
        const key = `ip:${r.registration_ip.toLowerCase()}`;
        if (!bannedMap.has(key)) {
          bannedMap.set(key, {
            id: `flagged_ip_${r.id}`,
            type: "ip",
            value: r.registration_ip,
            reason: r.suspicious_reason || "Flagged in referral check",
            banned_at: r.created_at,
            banned_by: "system",
            accounts: [],
          });
        }
      }
      if (r.device_id) {
        const key = `device:${r.device_id.toLowerCase()}`;
        if (!bannedMap.has(key)) {
          bannedMap.set(key, {
            id: `flagged_dev_${r.id}`,
            type: "device",
            value: r.device_id,
            reason: r.suspicious_reason || "Flagged in referral check",
            banned_at: r.created_at,
            banned_by: "system",
            accounts: [],
          });
        }
      }
    });

    // Associate registered accounts with each banned entity
    referrals.forEach((r) => {
      const acc = r.referred_name !== "—" ? `@${r.referred_name}` : r.referred_email;
      if (!acc || acc === "—") return;
      if (r.registration_ip) {
        const key = `ip:${r.registration_ip.toLowerCase()}`;
        if (bannedMap.has(key)) {
          const entry = bannedMap.get(key);
          if (!entry.accounts.includes(acc)) entry.accounts.push(acc);
        }
      }
      if (r.device_id) {
        const key = `device:${r.device_id.toLowerCase()}`;
        if (bannedMap.has(key)) {
          const entry = bannedMap.get(key);
          if (!entry.accounts.includes(acc)) entry.accounts.push(acc);
        }
      }
    });

    const bannedEntities = Array.from(bannedMap.values());

    const flaggedStats = {
      total_flagged: flaggedList.length,
      unique_ips_count: uniqueFlaggedIps.length,
      unique_devices_count: uniqueFlaggedDevices.length,
      unique_ips: uniqueFlaggedIps,
      unique_devices: uniqueFlaggedDevices,
    };

    return res.status(200).json({
      success: true,
      settings: settings || {},
      referrals,
      gifts,
      banned_entities: bannedEntities,
      banned_system_started_at: metaMap.banned_system_started_at || null,
      current_admin_ip: currentAdminIp,
      whitelist_ips: metaMap.admin_whitelist_ips || "",
      whitelist_devices: metaMap.admin_whitelist_devices || "",
      flagged_stats: flaggedStats,
    });
  }

  // POST — Update settings or perform admin action
  if (req.method === "POST") {
    const { action } = req.body || {};

    // 1. Action: Quick Toggle Master Redemption Switch
    if (action === "toggle_redemption") {
      const { enabled } = req.body;
      try {
        const updated = await updateReferralSettings({ redemption_enabled: Boolean(enabled) }, session.user.id);
        return res.status(200).json({ success: true, settings: updated });
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }

    // 2. Action: Quick Toggle Referral Program Switch
    if (action === "toggle_referral") {
      const { enabled } = req.body;
      try {
        const updated = await updateReferralSettings({ referral_enabled: Boolean(enabled) }, session.user.id);
        return res.status(200).json({ success: true, settings: updated });
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }

    // 2b. Action: Quick Toggle Email Verification Required for Referral
    if (action === "toggle_email_verification") {
      const { enabled, qualify_pending = true } = req.body;
      try {
        const updated = await updateReferralSettings({ require_email_verification: Boolean(enabled) }, session.user.id);

        let qualifiedCount = 0;
        // When turning OFF, qualify existing pending referrals so they become valid immediately!
        if (!enabled && qualify_pending) {
          const { data: pendingRefs } = await supabaseAdmin
            .from("referrals")
            .select("referred_id")
            .eq("status", "pending_verification")
            .limit(100);

          if (pendingRefs && pendingRefs.length > 0) {
            for (const r of pendingRefs) {
              try {
                const { data: qRes } = await supabaseAdmin.rpc("qualify_referral", {
                  p_referred_user_id: r.referred_id,
                });
                if (qRes?.success) qualifiedCount++;
              } catch (qErr) {
                console.warn("[toggle_email_verification] qualify error:", qErr?.message);
              }
            }
          }
        }

        return res.status(200).json({
          success: true,
          settings: updated,
          qualified_pending_count: qualifiedCount,
        });
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }

    // 2c. Action: Qualify all unrewarded referrals on demand (Dual gift rewards issued)
    if (action === "qualify_all_pending" || action === "qualify_all_unrewarded") {
      try {
        const { data: pendingRefs } = await supabaseAdmin
          .from("referrals")
          .select("referred_id")
          .neq("status", "rejected")
          .or("reward_issued.is.null,reward_issued.eq.false,status.eq.pending_verification,status.eq.flagged_suspicious")
          .limit(200);

        let qualifiedCount = 0;
        if (pendingRefs && pendingRefs.length > 0) {
          for (const r of pendingRefs) {
            try {
              const { data: qRes } = await supabaseAdmin.rpc("qualify_referral", {
                p_referred_user_id: r.referred_id,
              });
              if (qRes?.success) qualifiedCount++;
            } catch (qErr) {
              console.warn("[qualify_all_pending] error:", qErr?.message);
            }
          }
        }
        return res.status(200).json({ success: true, count: qualifiedCount });
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }

    // 3. Action: Approve flagged referral
    if (action === "approve_referral") {
      const { referral_id } = req.body;
      if (!referral_id) return res.status(400).json({ success: false, error: "referral_id_required" });

      const { data: ref } = await supabaseAdmin
        .from("referrals")
        .select("*")
        .eq("id", referral_id)
        .single();

      if (!ref) return res.status(404).json({ success: false, error: "referral_not_found" });

      // Run qualification RPC
      const { data: qualResult, error: qualErr } = await supabaseAdmin.rpc("qualify_referral", {
        p_referred_user_id: ref.referred_id,
      });

      if (qualErr) return res.status(500).json({ success: false, error: qualErr.message });
      return res.status(200).json({ success: true, result: qualResult });
    }

    // 4. Action: Reject referral
    if (action === "reject_referral") {
      const { referral_id, reason = "Admin rejected" } = req.body;
      const { error } = await supabaseAdmin
        .from("referrals")
        .update({ status: "rejected", suspicious_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", referral_id);

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true });
    }

    // 5. Action: Revoke an unused gift
    if (action === "revoke_gift") {
      const { gift_id, reason = "Revoked by admin" } = req.body;
      if (!gift_id) return res.status(400).json({ success: false, error: "gift_id_required" });

      const { data, error } = await supabaseAdmin.rpc("revoke_referral_gift", {
        p_gift_id: gift_id,
        p_admin_id: session.user.id,
        p_reason: reason,
      });

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, result: data });
    }

    // 5b. Action: Update Admin Whitelist (IPs and Devices)
    if (action === "update_whitelist") {
      const { whitelist_ips, whitelist_devices } = req.body;
      const now = new Date().toISOString();
      await supabaseAdmin.from("app_meta").upsert([
        { key: "admin_whitelist_ips", value: String(whitelist_ips || "").trim(), updated_at: now },
        { key: "admin_whitelist_devices", value: String(whitelist_devices || "").trim(), updated_at: now },
      ]);
      return res.status(200).json({ success: true });
    }

    // 5c. Action: Ban an IP or Device
    if (action === "ban_entity") {
      const { type, value, reason } = req.body || {};
      if (!type || !value) {
        return res.status(400).json({ success: false, error: "Both type ('ip' or 'device') and value are required." });
      }
      try {
        const banned = await banEntity({
          type,
          value,
          reason: reason || "Manual ban by admin",
          bannedBy: session.user.id,
        });
        return res.status(200).json({ success: true, banned });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // 5d. Action: Unban an IP or Device
    if (action === "unban_entity") {
      const { type, value } = req.body || {};
      if (!value) {
        return res.status(400).json({ success: false, error: "Value (IP or Device ID) is required to unban." });
      }
      try {
        const result = await unbanEntity({ type, value });
        return res.status(200).json({ success: true, ...result });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // 5e. Action: Clear all past bans & reset tracking (Fresh start)
    if (action === "clear_past_bans") {
      try {
        const result = await clearAllPastBans();
        return res.status(200).json({ success: true, ...result });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // 6. Update full referral settings
    const {
      referral_enabled,
      redemption_enabled,
      require_email_verification,
      max_lifetime_gifts,
      daily_redemption_limit,
      lock_delay_seconds,
      supplier_cost_per_gift,
      fraud_max_accounts_per_ip,
      fraud_max_accounts_per_device,
      whitelist_ips,
      whitelist_devices,
    } = req.body;

    const patch = {};

    if (whitelist_ips !== undefined || whitelist_devices !== undefined) {
      const now = new Date().toISOString();
      const metaRows = [];
      if (whitelist_ips !== undefined) {
        metaRows.push({ key: "admin_whitelist_ips", value: String(whitelist_ips || "").trim(), updated_at: now });
      }
      if (whitelist_devices !== undefined) {
        metaRows.push({ key: "admin_whitelist_devices", value: String(whitelist_devices || "").trim(), updated_at: now });
      }
      if (metaRows.length > 0) {
        await supabaseAdmin.from("app_meta").upsert(metaRows);
      }
    }

    if (typeof referral_enabled === "boolean") patch.referral_enabled = referral_enabled;
    if (typeof redemption_enabled === "boolean") patch.redemption_enabled = redemption_enabled;
    if (typeof require_email_verification === "boolean") patch.require_email_verification = require_email_verification;
    if (Number.isInteger(Number(max_lifetime_gifts))) patch.max_lifetime_gifts = Number(max_lifetime_gifts);
    if (Number.isInteger(Number(daily_redemption_limit))) patch.daily_redemption_limit = Number(daily_redemption_limit);
    if (Number.isInteger(Number(lock_delay_seconds))) patch.lock_delay_seconds = Number(lock_delay_seconds);
    if (fraud_max_accounts_per_ip) patch.fraud_max_accounts_per_ip = Number(fraud_max_accounts_per_ip);
    if (fraud_max_accounts_per_device) patch.fraud_max_accounts_per_device = Number(fraud_max_accounts_per_device);

    if (supplier_cost_per_gift !== undefined && Number(supplier_cost_per_gift) > 0) {
      const newCost = Number(supplier_cost_per_gift);
      patch.supplier_cost_per_gift = newCost;

      // Log in supplier_cost_history (non-fatal if table doesn't exist)
      try {
        await supabaseAdmin.from("supplier_cost_history").insert({
          cost_per_billion: newCost,
          currency: "USD",
          created_by: session.user.id,
          notes: "Updated from Admin Referral Settings",
        });
      } catch (logErr) {
        console.warn("[referrals] supplier_cost_history insert warning:", logErr?.message);
      }
    }

    try {
      const savedSettings = await updateReferralSettings(patch, session.user.id);
      return res.status(200).json({ success: true, settings: savedSettings });
    } catch (e) {
      console.error("[admin/referrals] update settings error:", e?.message);
      return res.status(500).json({ success: false, error: e?.message || "Failed to save settings" });
    }
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}

