import { supabaseAdmin } from "./supabaseAdmin";

// Wrong tx hashes: 3 within 10 minutes freezes payment checks for that
// user for 2 minutes (see migration 018). Everything here fails OPEN —
// if the table/function isn't there yet, payments keep working.
const COUNTED = new Set([
  "invalid_tx_hash",
  "not_found_yet",
  "tx_failed",
  "wrong_recipient",
  "amount_too_low",
  "amount_mismatch",
  "tx_already_used",
]);

export const isWrongHash = (reason) => COUNTED.has(reason);

// Seconds left on a freeze (0 = not frozen).
export async function frozenSeconds(userId) {
  try {
    const { data } = await supabaseAdmin
      .from("hash_failures")
      .select("locked_until")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.locked_until) return 0;
    const left = new Date(data.locked_until).getTime() - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  } catch {
    return 0;
  }
}

// Records one wrong attempt; returns seconds frozen if this one tripped
// the limit (0 otherwise).
export async function recordWrongHash(userId) {
  try {
    const { data } = await supabaseAdmin.rpc("record_hash_failure", { p_user: userId });
    if (!data) return 0;
    return Math.max(0, Math.ceil((new Date(data).getTime() - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

export const frozenResponse = (secs) => ({
  success: false,
  error: "too_many_attempts",
  retry_after: secs,
});
