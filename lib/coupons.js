import { supabaseAdmin } from "./supabaseAdmin";

// Smallest amount a coupon can bring an order down to. Keeps orders
// payable on-chain (and above the on-chain fingerprint) — a 100%
// coupon therefore still leaves this minimum to pay.
export const MIN_PAYABLE = 0.1;
// A coupon is refused when it would leave less than this profit per item
// (price after discount minus what the supplier charges us).
export const MIN_COUPON_PROFIT = Number(process.env.MIN_COUPON_PROFIT || 0.1);
// A pending (unpaid) order only holds a coupon use for this long, so
// abandoned checkouts can't lock up limited-use codes.
const PENDING_HOLD_MS = 60 * 60 * 1000;

export function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

export function computeDiscount(coupon, base) {
  const raw =
    coupon.discount_type === "percent"
      ? (base * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  const capped = Math.min(raw, Math.max(0, base - MIN_PAYABLE));
  return Math.round(capped * 100) / 100;
}

// product_ids (multi-select) wins; the old single product_id still
// works; neither set = every product.
export function couponAppliesTo(coupon, productId) {
  const ids = Array.isArray(coupon.product_ids) ? coupon.product_ids.map(Number) : [];
  if (ids.length) return ids.includes(Number(productId));
  if (coupon.product_id !== null && coupon.product_id !== undefined) {
    return Number(coupon.product_id) === Number(productId);
  }
  return true;
}

// Orders that currently count as a use of this coupon.
export async function activeUses(couponId) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status, created_at")
    .eq("coupon_id", couponId)
    .not("status", "in", "(cancelled,failed)")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(10000);
  const now = Date.now();
  return (data || []).filter(
    (o) =>
      o.status !== "pending_payment" || now - new Date(o.created_at).getTime() < PENDING_HOLD_MS
  );
}

// Looks up + fully validates a code for this user/product/order value.
// Returns { ok: true, coupon, discount } or { ok: false, reason }.
export async function checkCoupon({ code, userId, productId, base, unitCost, quantity = 1 }) {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, reason: "invalid_coupon" };

  const { data: coupon } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();

  if (!coupon) return { ok: false, reason: "invalid_coupon" };
  if (!coupon.active) return { ok: false, reason: "coupon_inactive" };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "coupon_expired" };
  }
  if (!couponAppliesTo(coupon, productId)) {
    return { ok: false, reason: "coupon_wrong_product" };
  }
  if (coupon.min_order !== null && base < Number(coupon.min_order)) {
    return { ok: false, reason: "coupon_min_order", min_order: Number(coupon.min_order) };
  }

  if (coupon.max_uses !== null || coupon.per_user_limit !== null) {
    const uses = await activeUses(coupon.id);
    if (coupon.max_uses !== null && uses.length >= coupon.max_uses) {
      return { ok: false, reason: "coupon_used_up" };
    }
    if (
      coupon.per_user_limit !== null &&
      uses.filter((u) => u.user_id === userId).length >= coupon.per_user_limit
    ) {
      return { ok: false, reason: "coupon_already_used" };
    }
  }

  const discount = computeDiscount(coupon, base);

  // Profit guard: never let a coupon push the margin below the minimum.
  const cost = Number(unitCost);
  if (Number.isFinite(cost) && Number(quantity) > 0) {
    const profitPerItem = (base - discount) / Number(quantity) - cost;
    if (profitPerItem < MIN_COUPON_PROFIT - 1e-9) {
      return { ok: false, reason: "coupon_unavailable" };
    }
  }

  return { ok: true, coupon, discount };
}

// After an order carrying a coupon is inserted, re-check that it still
// fits within the limits (two people can race for the last use). Uses
// are ranked by creation time, so only the late arrivals are rejected.
export async function orderFitsCouponLimits(coupon, orderId, userId) {
  if (coupon.max_uses === null && coupon.per_user_limit === null) return true;
  const uses = await activeUses(coupon.id);
  const idx = uses.findIndex((u) => u.id === orderId);
  if (idx === -1) return false;
  if (coupon.max_uses !== null && idx >= coupon.max_uses) return false;
  if (coupon.per_user_limit !== null) {
    const mine = uses.slice(0, idx + 1).filter((u) => u.user_id === userId).length;
    if (mine > coupon.per_user_limit) return false;
  }
  return true;
}
