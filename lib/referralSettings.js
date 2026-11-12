import { supabaseAdmin } from "./supabaseAdmin";

export const DEFAULT_REFERRAL_SETTINGS = {
  id: 1,
  referral_enabled: true,
  redemption_enabled: true,
  require_email_verification: false,
  max_lifetime_gifts: 15,
  daily_redemption_limit: 3,
  lock_delay_seconds: 0,
  tokens_per_gift: 1000000000,
  supplier_cost_per_gift: 0.06,
  currency: "USD",
  fraud_max_accounts_per_ip: 2,
  fraud_max_accounts_per_device: 1,
};

/**
 * Retrieves the singleton referral settings row (id=1).
 * If the row does not exist yet, it automatically seeds it with sensible defaults.
 */
export async function getReferralSettings() {
  try {
    let { data: settings, error } = await supabaseAdmin
      .from("referral_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.warn("[getReferralSettings] fetch error:", error.message);
      return DEFAULT_REFERRAL_SETTINGS;
    }

    if (!settings) {
      // Auto-seed row 1 so it always exists in DB
      const { data: seeded, error: seedErr } = await supabaseAdmin
        .from("referral_settings")
        .upsert(
          { ...DEFAULT_REFERRAL_SETTINGS, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        )
        .select()
        .maybeSingle();

      if (!seedErr && seeded) return seeded;
      return DEFAULT_REFERRAL_SETTINGS;
    }

    return settings;
  } catch (e) {
    console.warn("[getReferralSettings] exception:", e?.message);
    return DEFAULT_REFERRAL_SETTINGS;
  }
}

/**
 * Updates referral settings. Handles both existing and non-existing row 1.
 */
export async function updateReferralSettings(patch, userId = null) {
  const fullPatch = {
    ...patch,
    updated_at: new Date().toISOString(),
    ...(userId ? { updated_by: userId } : {}),
  };

  const { data: existing } = await supabaseAdmin
    .from("referral_settings")
    .select("id")
    .eq("id", 1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("referral_settings")
      .update(fullPatch)
      .eq("id", 1)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || fullPatch;
  } else {
    const fullRow = {
      ...DEFAULT_REFERRAL_SETTINGS,
      ...fullPatch,
      id: 1,
    };
    const { data, error } = await supabaseAdmin
      .from("referral_settings")
      .insert(fullRow)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || fullRow;
  }
}

