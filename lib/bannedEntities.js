import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Retrieves the list of banned IPs and Devices from app_meta.
 * Returns Array<{ id, type: 'ip' | 'device', value: string, reason: string, banned_at: string, banned_by: string }>
 */
export async function getBannedEntities() {
  try {
    const { data: row } = await supabaseAdmin
      .from("app_meta")
      .select("value")
      .eq("key", "banned_entities_json")
      .maybeSingle();

    if (!row?.value) return [];
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("[getBannedEntities] error:", e?.message);
    return [];
  }
}

/**
 * Persists the banned entities list into app_meta.
 */
export async function saveBannedEntities(list) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("app_meta").upsert([
    { key: "banned_entities_json", value: JSON.stringify(list || []), updated_at: now },
  ]);
  return list;
}

/**
 * Checks if a given IP or Device is banned (unless whitelisted).
 */
export async function checkEntityBanned({ ip, deviceId, whitelistIps = [], whitelistDevices = [] }) {
  const cleanIp = String(ip || "").trim();
  const cleanDevice = String(deviceId || "").trim();

  // If IP is whitelisted by admin, it can never be banned
  const isIpWhitelisted = cleanIp && whitelistIps.some((w) => w.toLowerCase() === cleanIp.toLowerCase());
  // If Device is whitelisted by admin, it can never be banned
  const isDeviceWhitelisted = cleanDevice && whitelistDevices.some((w) => w.toLowerCase() === cleanDevice.toLowerCase());

  if (isIpWhitelisted || isDeviceWhitelisted) {
    return { banned: false, whitelisted: true };
  }

  const list = await getBannedEntities();

  if (cleanIp) {
    const bannedIp = list.find((b) => b.type === "ip" && b.value.toLowerCase() === cleanIp.toLowerCase());
    if (bannedIp) {
      return {
        banned: true,
        type: "ip",
        value: cleanIp,
        reason: bannedIp.reason || "This IP address has been banned by the administrator.",
      };
    }
  }

  if (cleanDevice) {
    const bannedDevice = list.find((b) => b.type === "device" && b.value.toLowerCase() === cleanDevice.toLowerCase());
    if (bannedDevice) {
      return {
        banned: true,
        type: "device",
        value: cleanDevice,
        reason: bannedDevice.reason || "This device/mobile has been banned by the administrator.",
      };
    }
  }

  return { banned: false };
}

/**
 * Bans an IP or Device manually or via anti-fraud trigger.
 */
export async function banEntity({ type, value, reason = "Banned by administrator", bannedBy = "admin" }) {
  const cleanType = String(type || "").trim().toLowerCase();
  const cleanVal = String(value || "").trim();

  if (!cleanVal || (cleanType !== "ip" && cleanType !== "device")) {
    throw new Error("Invalid type or value for ban");
  }

  const current = await getBannedEntities();
  const existingIdx = current.findIndex(
    (b) => b.type === cleanType && b.value.toLowerCase() === cleanVal.toLowerCase()
  );

  const now = new Date().toISOString();
  const newEntry = {
    id: `ban_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: cleanType,
    value: cleanVal,
    reason: reason || "Manual ban by admin",
    banned_at: now,
    banned_by: bannedBy,
  };

  let updatedList;
  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = { ...updatedList[existingIdx], ...newEntry };
  } else {
    updatedList = [newEntry, ...current];
  }

  await saveBannedEntities(updatedList);
  return newEntry;
}

/**
 * Unbans an IP or Device.
 * Also unflags any suspicious referrals associated with this IP/device and clears device counters.
 */
export async function unbanEntity({ type, value }) {
  const cleanType = String(type || "").trim().toLowerCase();
  const cleanVal = String(value || "").trim();
  if (!cleanVal) throw new Error("Value is required for unban");

  const current = await getBannedEntities();
  const updatedList = current.filter(
    (b) => !(b.type === cleanType && b.value.toLowerCase() === cleanVal.toLowerCase())
  );

  await saveBannedEntities(updatedList);

  // Unflag any referrals matching this IP or Device
  try {
    if (cleanType === "ip") {
      await supabaseAdmin
        .from("referrals")
        .update({ status: "qualified", suspicious_reason: null, updated_at: new Date().toISOString() })
        .eq("registration_ip", cleanVal)
        .eq("status", "flagged_suspicious");
    } else if (cleanType === "device") {
      await supabaseAdmin
        .from("referrals")
        .update({ status: "qualified", suspicious_reason: null, updated_at: new Date().toISOString() })
        .eq("device_id", cleanVal)
        .eq("status", "flagged_suspicious");

      // Reset device counter so this device can register again
      await supabaseAdmin
        .from("device_registrations")
        .delete()
        .eq("device_id", cleanVal);
    }
  } catch (err) {
    console.warn("[unbanEntity] DB unflag error:", err?.message);
  }

  return { success: true, removed: cleanVal };
}

/**
 * Clears ALL past bans, resets old test flagged referrals to qualified,
 * purges old test device registrations, and marks a fresh start timestamp.
 */
export async function clearAllPastBans() {
  // 1. Reset banned entities list
  await saveBannedEntities([]);

  // 2. Clear flagged referrals -> reset to qualified
  let unflaggedCount = 0;
  try {
    const { data: flagged } = await supabaseAdmin
      .from("referrals")
      .select("id, referred_id")
      .eq("status", "flagged_suspicious");

    if (flagged && flagged.length > 0) {
      unflaggedCount = flagged.length;
      await supabaseAdmin
        .from("referrals")
        .update({
          status: "qualified",
          suspicious_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("status", "flagged_suspicious");

      // Attempt to qualify them in referral rewards
      for (const r of flagged) {
        try {
          await supabaseAdmin.rpc("qualify_referral", { p_referred_user_id: r.referred_id });
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[clearAllPastBans] referrals reset error:", err?.message);
  }

  // 3. Clear old device registrations
  let deletedDeviceCount = 0;
  try {
    const { count } = await supabaseAdmin
      .from("device_registrations")
      .delete()
      .neq("device_id", "keep_schema_safe_dummy_xyz");
    deletedDeviceCount = count || 0;
  } catch (err) {
    console.warn("[clearAllPastBans] device registrations cleanup error:", err?.message);
  }

  // 4. Save fresh start timestamp in app_meta
  const now = new Date().toISOString();
  await supabaseAdmin.from("app_meta").upsert([
    { key: "banned_system_started_at", value: now, updated_at: now },
  ]);

  return {
    success: true,
    unflagged_referrals_count: unflaggedCount,
    deleted_device_registrations: deletedDeviceCount,
    started_at: now,
  };
}

