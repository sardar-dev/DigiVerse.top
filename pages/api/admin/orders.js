import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { supplierLabels } from "../../../lib/suppliers";
import { settleAllBuffOrders, placeBuffOrder, settleBuffOrder } from "../../../lib/tunvnBuff";
import { cleanupExpiredPendingOrders } from "../../../lib/orderCleanup";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    // Purge expired unpaid orders (>30 mins) completely from database
    await cleanupExpiredPendingOrders().catch(() => {});

    // Settle any fulfilling TunVN buff orders in the background
    settleAllBuffOrders(10).catch(() => {});

    let { data, error } = await supabaseAdmin
      .from("orders")
      .select("*, products(title, tunvn_buff)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error && /tunvn_buff/i.test(error.message)) {
      ({ data, error } = await supabaseAdmin
        .from("orders")
        .select("*, products(title)")
        .order("created_at", { ascending: false })
        .limit(200));
    }
    if (error) return res.status(500).json({ success: false, error: error.message });

    const now = Date.now();
    data = (data || []).filter(
      (o) => o.status !== "pending_payment" || (now - new Date(o.created_at).getTime() < 30 * 60 * 1000)
    );

    // Resolve account email/username from profiles (ignoring null guest user_ids),
    // with auth.users fallback for any account missing a profile email.
    const userIds = [...new Set((data || []).map((o) => o.user_id).filter(Boolean))];
    const profilesMap = new Map();
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, username")
        .in("id", userIds);
      for (const p of profiles || []) profilesMap.set(p.id, p);

      const missingEmailIds = userIds
        .filter((uid) => !profilesMap.get(uid)?.email)
        .slice(0, 10);
      if (missingEmailIds.length) {
        const authLookups = await Promise.allSettled(
          missingEmailIds.map((uid) => supabaseAdmin.auth.admin.getUserById(uid))
        );
        authLookups.forEach((res, idx) => {
          const authEmail = res.status === "fulfilled" ? res.value?.data?.user?.email : null;
          if (authEmail) {
            const uid = missingEmailIds[idx];
            const prev = profilesMap.get(uid) || { id: uid };
            profilesMap.set(uid, { ...prev, email: authEmail });
          }
        });
      }
    }
    const sup = await supplierLabels();
    const orders = (data || []).map((o) => {
      const prof = o.user_id ? profilesMap.get(o.user_id) : null;
      return {
        ...o,
        user_email: prof?.email || o.email || null,
        user_username: prof?.username || null,
        is_guest: !o.user_id,
        supplier_label: o.supplier ? sup[o.supplier]?.label || o.supplier : null,
        can_retry: Boolean(o.supplier && sup[o.supplier]?.idempotent),
        is_buff: Boolean(o.products?.tunvn_buff || o.supplier === "tunvn"),
      };
    });
    return res.status(200).json({ success: true, orders });
  }

  if (req.method === "POST") {
    const { id, status, items, digitrust_order_id, action } = req.body || {};

    if (action === "retry_buff" && id) {
      const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return res.status(404).json({ success: false, error: "order_not_found" });
      const result = await placeBuffOrder(order);
      if (result.placed) {
        await supabaseAdmin.from("orders").update({ failure_reason: null }).eq("id", id);
        return res.status(200).json({ success: true, message: "Order placed on TunVN" });
      }
      const reason = result.reason || "buff_order_failed";
      await supabaseAdmin
        .from("orders")
        .update({ failure_reason: `tunvn_retry_failed: ${reason}`.slice(0, 300) })
        .eq("id", id);
      return res.status(400).json({ success: false, error: reason });
    }

    if (action === "settle_buff" && id) {
      const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return res.status(404).json({ success: false, error: "order_not_found" });
      const result = await settleBuffOrder(order);
      return res.status(200).json({ success: true, state: result.state });
    }

    // Body: { id, status, items?, digitrust_order_id? } — manual
    // override, e.g. marking a failed order "refunded" once you've
    // sent funds back by hand, cancelling a stuck order, or resolving
    // a "needs_reconciliation" order after checking DigiTrust's own
    // order history (mark delivered with the actual items, or fail
    // it for a refund if it turns out nothing was purchased).
    const allowed = [
      "refunded",
      "failed",
      "delivered",
      "cancelled",
      "pending_payment",
    ];
    if (!id || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: "invalid_request" });
    }
    const patch = { status, updated_at: new Date().toISOString() };
    if (status === "delivered" && items) {
      patch.items = Array.isArray(items) ? items : String(items).split("\n").filter(Boolean);
    }
    if (digitrust_order_id) patch.digitrust_order_id = digitrust_order_id;

    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });

    if (["cancelled", "refunded", "failed"].includes(status)) {
      await supabaseAdmin.rpc("release_reserved_gifts", { p_order_id: id }).catch(() => {});
    }

    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    // Body: { id } — permanently removes the order row. Use for
    // junk/duplicate/abandoned pending orders, not for anything with
    // real money attached (cancel/refund those instead so there's a
    // record).
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "id_required" });
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
