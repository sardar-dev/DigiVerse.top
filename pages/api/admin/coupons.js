import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { normalizeCode } from "../../../lib/coupons";

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const { data: coupons, error } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ success: false, error: error.message });

    // One query for all usage, aggregated here (cheaper than N counts).
    const { data: used } = await supabaseAdmin
      .from("orders")
      .select("coupon_id, status, discount_amount, created_at")
      .not("coupon_id", "is", null)
      .not("status", "in", "(cancelled,failed)")
      .limit(10000);
    const stats = new Map();
    const hold = Date.now() - 60 * 60 * 1000;
    for (const o of used || []) {
      if (o.status === "pending_payment" && new Date(o.created_at).getTime() < hold) continue;
      const s = stats.get(o.coupon_id) || { uses: 0, discount: 0 };
      s.uses++;
      if (["paid", "fulfilling", "delivered"].includes(o.status)) {
        s.discount += Number(o.discount_amount) || 0;
      }
      stats.set(o.coupon_id, s);
    }
    return res.status(200).json({
      success: true,
      coupons: (coupons || []).map((c) => ({
        ...c,
        uses: stats.get(c.id)?.uses || 0,
        discount_given: Number((stats.get(c.id)?.discount || 0).toFixed(2)),
      })),
    });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const code = normalizeCode(b.code);
    const type = b.discount_type;
    const value = Number(b.discount_value);

    if (!CODE_RE.test(code)) {
      return res.status(400).json({ success: false, error: "invalid_code_format" });
    }
    if (!["percent", "fixed"].includes(type)) {
      return res.status(400).json({ success: false, error: "invalid_type" });
    }
    if (!Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100)) {
      return res.status(400).json({ success: false, error: "invalid_value" });
    }
    const maxUses = num(b.max_uses);
    const perUser = num(b.per_user_limit);
    const minOrder = num(b.min_order);
    for (const [v, ok] of [
      [maxUses, (x) => Number.isInteger(x) && x > 0],
      [perUser, (x) => Number.isInteger(x) && x > 0],
      [minOrder, (x) => Number.isFinite(x) && x >= 0],
    ]) {
      if (v !== null && !ok(v)) {
        return res.status(400).json({ success: false, error: "invalid_limit" });
      }
    }
    let expiresAt = null;
    if (b.expires_at) {
      const d = new Date(b.expires_at);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, error: "invalid_expiry" });
      }
      expiresAt = d.toISOString();
    }

    const ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(Number))];
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
      return res.status(400).json({ success: false, error: "invalid_products" });
    }
    const row = {
        code,
        discount_type: type,
        discount_value: value,
        product_id: null,
        ...(ids.length ? { product_ids: ids } : {}),
        max_uses: maxUses,
        per_user_limit: perUser,
        min_order: minOrder,
        expires_at: expiresAt,
    };
    const { data, error } = await supabaseAdmin.from("coupons").insert(row).select().single();
    if (error) {
      if (/product_ids/.test(error.message || "")) {
        return res.status(500).json({ success: false, error: "run_migration_016" });
      }
      return res.status(error.code === "23505" ? 409 : 500).json({
        success: false,
        error: error.code === "23505" ? "code_already_exists" : error.message,
      });
    }
    return res.status(200).json({ success: true, coupon: data });
  }

  if (req.method === "PATCH") {
    const { id, active } = req.body || {};
    if (!id || typeof active !== "boolean") {
      return res.status(400).json({ success: false, error: "invalid_request" });
    }
    const { error } = await supabaseAdmin.from("coupons").update({ active }).eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "invalid_request" });
    // Orders keep their coupon_code text; only the link is cleared.
    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
