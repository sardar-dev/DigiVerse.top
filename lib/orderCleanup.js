import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Permanently deletes any pending_payment order that is older than 30 minutes.
 * - Releases any referral gifts reserved for the order
 * - Deletes referral_gift_redemptions associated with the order
 * - Deletes the order row from public.orders
 * Returns the number of expired orders cleaned up.
 */
export async function cleanupExpiredPendingOrders() {
  try {
    // 1. Try invoking database function if available
    try {
      const { data: dbCount, error: rpcErr } = await supabaseAdmin.rpc("delete_expired_pending_orders");
      if (!rpcErr && typeof dbCount === "number") {
        return dbCount;
      }
    } catch {}

    // 2. Fallback direct query cleanup via supabaseAdmin
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: expiredOrders, error: findErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("status", "pending_payment")
      .lt("created_at", thirtyMinutesAgo);

    if (findErr || !expiredOrders || expiredOrders.length === 0) {
      return 0;
    }

    const orderIds = expiredOrders.map((o) => o.id);

    // Release any reserved gifts
    for (const o of expiredOrders) {
      try {
        await supabaseAdmin.rpc("release_reserved_gifts", { p_order_id: o.id });
      } catch {}
    }

    // Delete redemptions tied to these orders
    try {
      await supabaseAdmin
        .from("referral_gift_redemptions")
        .delete()
        .in("order_id", orderIds);
    } catch {}

    // Permanently delete orders from public.orders
    const { error: delErr } = await supabaseAdmin
      .from("orders")
      .delete()
      .in("id", orderIds);

    if (delErr) {
      console.warn("[orderCleanup] Failed to delete expired orders:", delErr.message);
    }

    return orderIds.length;
  } catch (e) {
    console.warn("[orderCleanup] Error during cleanup:", e?.message);
    return 0;
  }
}

