import { supabaseAdmin } from "./supabaseAdmin";
import * as tunvn from "./suppliers/tunvn";
import * as ppure from "./suppliers/ppure";

// Auto-fulfillment for Muse AI Token Boost products (TunVN or Ppure Store).
// Supported product configurations:
//  - buff_provider = 'tunvn' (or legacy tunvn_buff = true with null buff_provider)
//  - buff_provider = 'ppure'
//
// Safety rule: a CLEAN failure before any money moved (bad invite code, wallet
// balance too low, key missing, price above what the customer paid) falls back
// cleanly to `awaiting_manual_fulfillment` so admin can refill & click Send to API
// (or Manual Done). An AMBIGUOUS failure (timeout, 5xx, unclear payment state)
// moves to `needs_reconciliation` without refunding so money is never spent twice.

const CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
const STUCK_AFTER_MS = 30 * 60 * 1000;

export function resolveBuffProvider(product) {
  if (!product) return null;
  if (product.buff_provider === "ppure") return "ppure";
  if (product.buff_provider === "tunvn") return "tunvn";
  if (product.tunvn_buff) return "tunvn";
  return null;
}

export async function getBuffProductProvider(productId) {
  try {
    let { data, error } = await supabaseAdmin
      .from("products")
      .select("tunvn_buff, buff_provider")
      .eq("id", productId)
      .maybeSingle();
    if (error && /buff_provider/i.test(error.message || "")) {
      ({ data, error } = await supabaseAdmin
        .from("products")
        .select("tunvn_buff")
        .eq("id", productId)
        .maybeSingle());
    }
    return error ? null : resolveBuffProvider(data);
  } catch {
    return null;
  }
}

export async function isBuffProduct(productId) {
  return Boolean(await getBuffProductProvider(productId));
}

export function parseBuffRequest(order) {
  let raw = String(order.activation_info || "").trim();
  // Strip URL prefixes or extract invite code if customer pasted a full link
  if (raw.includes("http://") || raw.includes("https://") || raw.includes("/")) {
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const parts = u.pathname.split("/").filter(Boolean);
      const codeFromPath = parts[parts.length - 1];
      const codeFromParam = u.searchParams.get("invite") || u.searchParams.get("ref") || u.searchParams.get("code");
      raw = (codeFromParam || codeFromPath || raw).trim();
    } catch {
      const m = raw.match(/([A-Za-z0-9_-]{4,32})\s*$/);
      if (m) raw = m[1];
    }
  }
  const code = raw;
  const qty = Number(order.quantity);
  if (!CODE_RE.test(code)) return null;
  if (!Number.isInteger(qty) || qty < 1 || qty > 30) return null;
  return { code, qty };
}

async function markBuffDelivered(order, items, now) {
  const { error } = await supabaseAdmin
    .from("orders")
    .update({
      status: "delivered",
      items,
      failure_reason: null,
      updated_at: now,
    })
    .eq("id", order.id)
    .in("status", ["paid", "fulfilling", "awaiting_manual_fulfillment"]);
  if (error) console.error("[museBuff] mark delivered failed:", error.message);

  if (Number(order.gifts_redeemed || 0) > 0) {
    try {
      await supabaseAdmin.rpc("finalize_gift_redemption", {
        p_order_id: order.id,
        p_actual_cost: order.unit_cost ? Number(order.unit_cost) : null,
      });
    } catch {}
  }
}

async function markBuffNeedsReconciliation(order, reason, now) {
  if (Number(order.gifts_redeemed || 0) > 0) {
    try {
      await supabaseAdmin.rpc("release_reserved_gifts", { p_order_id: order.id });
    } catch {}
  }
  await supabaseAdmin
    .from("orders")
    .update({ status: "needs_reconciliation", failure_reason: reason.slice(0, 300), updated_at: now })
    .eq("id", order.id)
    .eq("status", "fulfilling");
}

async function savePlacedFulfilling(orderId, supplier, supplierOrderId, unitCost) {
  const now = new Date().toISOString();
  const patch = {
    status: "fulfilling",
    supplier,
    supplier_order_id: supplierOrderId,
    failure_reason: null,
    updated_at: now,
    ...(unitCost !== null && unitCost !== undefined ? { unit_cost: Number(unitCost.toFixed(6)) } : {}),
  };
  let { error } = await supabaseAdmin.from("orders").update(patch).eq("id", orderId);
  if (error) {
    ({ error } = await supabaseAdmin
      .from("orders")
      .update({
        status: "fulfilling",
        supplier,
        supplier_order_id: supplierOrderId,
        updated_at: now,
      })
      .eq("id", orderId));
  }
  return error;
}

async function placeTunvnOrder(order, req) {
  if (!tunvn.configured()) return { fallback: true, reason: "tunvn_not_configured" };

  let price = null;
  try {
    price = await tunvn.buffCheck(req.code, req.qty);
  } catch (e) {
    console.warn(`[tunvnBuff] buffCheck non-fatal error for code "${req.code}":`, e?.message);
  }
  const isGiftOrder = Number(order.gifts_redeemed || 0) > 0;
  if (!isGiftOrder && price !== null && price > Number(order.total)) {
    return { fallback: true, reason: `cost_${price}_exceeds_paid_${order.total}` };
  }

  let placed;
  try {
    placed = await tunvn.buffOrder(req.code, req.qty);
  } catch (e) {
    const isExplicitReject = /thất bại|không thành công|hết hàng|từ chối|invalid|fail|error|reject|balance too low/i.test(e.message || "");
    if (e.ambiguous && !isExplicitReject) return { ambiguous: true, reason: e.message };
    const reason = e.code === "INSUFFICIENT_BALANCE" ? "TunVN wallet balance too low" : e.message;
    return { fallback: true, reason: `buff_order_rejected: ${reason}` };
  }

  const cost = placed.price ?? price;
  const unitCost = cost !== null && cost !== undefined ? Number(cost) / req.qty : null;
  const saveErr = await savePlacedFulfilling(order.id, "tunvn", placed.batchId, unitCost);
  if (saveErr) {
    return { ambiguous: true, reason: `buff_placed_but_not_saved: batch ${placed.batchId}: ${saveErr.message}` };
  }
  return { placed: true, provider: "tunvn" };
}

async function placePpureOrder(order, req, { isRetry = false } = {}) {
  if (!ppure.configured()) return { fallback: true, reason: "ppure_not_configured" };

  let sku = null;
  try {
    sku = await ppure.getBoostSku();
  } catch (e) {
    if (e.code === "unauthorized" || e.code === "api_access_off" || e.code === "not_found") {
      return { fallback: true, reason: `ppure_${e.code}: ${e.message}` };
    }
    console.warn("[ppureBuff] getBoostSku non-fatal error (proceeding with order):", e?.message);
  }

  if (sku) {
    const inviteField = sku.fields?.find((f) => f.key === "invite");
    const maxLen = Number(inviteField?.max_length || 6);
    if (req.code.length > maxLen) {
      return { fallback: true, reason: `invite_code_exceeds_${maxLen}_chars` };
    }
    if (req.qty < sku.minQuantity || req.qty > sku.maxQuantity) {
      return { fallback: true, reason: `qty_${req.qty}_outside_ppure_limits_${sku.minQuantity}_${sku.maxQuantity}` };
    }
  }

  const unitPriceGuess = sku?.price !== null && sku?.price !== undefined ? Number(sku.price) : 0.06;
  const estTotal = unitPriceGuess * req.qty;
  const isGiftOrder = Number(order.gifts_redeemed || 0) > 0;
  const paidTotal = Number(order.total || 0);

  if (!isGiftOrder && sku?.price !== null && estTotal > paidTotal + 0.001) {
    return { fallback: true, reason: `cost_${estTotal.toFixed(2)}_exceeds_paid_${paidTotal.toFixed(2)}` };
  }

  // Ppure stores books in CNY and allows +/-0.01 conversion variance above price * qty
  const rawMax = estTotal + 0.05;
  const maxAmount = !isGiftOrder && paidTotal > 0 ? Math.min(rawMax, paidTotal).toFixed(2) : rawMax.toFixed(2);

  // Reuse deterministic idempotency key within Ppure's 24h window unless prior attempt returned payment or aged out
  const ageMs = Date.now() - new Date(order.updated_at || order.created_at || Date.now()).getTime();
  const needsFreshKey =
    isRetry && (/payment_returned/i.test(order.failure_reason || "") || ageMs > 20 * 3600 * 1000);
  const idempotencyKey = needsFreshKey
    ? `digiverse-${order.id}-${Date.now().toString(36)}`
    : `digiverse-${order.id}`;

  let placed;
  try {
    placed = await ppure.createBoostOrder({
      quantity: req.qty,
      inviteCode: req.code,
      maxAmount,
      idempotencyKey,
    });
  } catch (e) {
    if (e.ambiguous) return { ambiguous: true, reason: e.message };
    return { fallback: true, reason: `ppure_${e.code || "rejected"}: ${e.message}` };
  }

  const unitCost =
    placed.amount !== null && placed.amount !== undefined
      ? Number((Number(placed.amount) / req.qty).toFixed(6))
      : unitPriceGuess;

  if (placed.status === "delivered") {
    const items = placed.items?.length
      ? placed.items
      : [`Muse AI token credited to invite code ${req.code} (${req.qty}B).`];
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        supplier: "ppure",
        supplier_order_id: placed.id,
        unit_cost: unitCost,
      })
      .eq("id", order.id);
    if (updErr) console.warn("[ppureBuff] saving supplier metadata note:", updErr.message);
    await markBuffDelivered({ ...order, unit_cost: unitCost }, items, new Date().toISOString());
    return { placed: true, delivered: true, provider: "ppure", items };
  }

  const saveErr = await savePlacedFulfilling(order.id, "ppure", placed.id, unitCost);
  if (saveErr) {
    return { ambiguous: true, reason: `ppure_placed_but_not_saved: order ${placed.id}: ${saveErr.message}` };
  }
  return { placed: true, delivered: false, provider: "ppure" };
}

// Places an API boost order on whichever provider (`tunvn` or `ppure`) is configured.
// -> { placed: true, delivered?, items?, provider } | { fallback: true, reason } | { ambiguous: true, reason }
export async function placeBuffOrder(order, opts = {}) {
  const req = parseBuffRequest(order);
  if (!req) return { fallback: true, reason: "invalid_invite_code_or_quantity" };

  const provider = opts.provider || (await getBuffProductProvider(order.product_id));
  if (!provider) return { fallback: true, reason: "api_fulfillment_not_enabled" };

  if (provider === "ppure") return placePpureOrder(order, req, opts);
  return placeTunvnOrder(order, req);
}

// Polls TunVN or Ppure Store and settles an order waiting in "fulfilling".
// -> { state: "done" | "failed" | "pending" | "manual" | "skip", items? }
export async function settleBuffOrder(order) {
  if (!order) return { state: "skip" };
  if (order.status === "delivered" || order.status === "completed") {
    return { state: "done", items: order.items || [] };
  }
  if (["failed", "refunded", "cancelled", "needs_reconciliation"].includes(order.status)) {
    return { state: "failed" };
  }
  if (order.status === "awaiting_manual_fulfillment") {
    return { state: "manual" };
  }
  if (order.status !== "fulfilling" || !order.supplier_order_id) {
    return { state: "skip" };
  }
  if (order.supplier !== "tunvn" && order.supplier !== "ppure") {
    return { state: "skip" };
  }

  const now = new Date().toISOString();
  let st;

  if (order.supplier === "ppure") {
    try {
      const ord = await ppure.getOrder(order.supplier_order_id);
      if (ord.status === "delivered") {
        st = { state: "done", items: ord.items };
      } else if (ord.status === "refunded" || ord.status === "cancelled") {
        st = { state: "failed", detail: `ppure_order_${ord.status}` };
      } else {
        st = { state: "pending" };
      }
    } catch (e) {
      console.warn("[ppureBuff] status check failed:", e?.message);
      st = { state: "pending", detail: e?.message };
    }
  } else {
    try {
      st = await tunvn.buffStatus(order.supplier_order_id);
    } catch (e) {
      console.warn("[tunvnBuff] status check failed:", e?.message);
      st = { state: "pending", detail: e?.message };
    }
  }

  if (st.state === "done") {
    const code = String(order.activation_info || "").trim();
    const items = st.items?.length
      ? st.items
      : [`Muse AI token credited to invite code ${code} (${order.quantity}B).`];
    await markBuffDelivered(order, items, now);
    return { state: "done", items };
  }

  if (st.state === "failed") {
    const prefix = order.supplier === "ppure" ? "ppure_buff_failed" : "tunvn_buff_failed";
    await markBuffNeedsReconciliation(order, `${prefix}: ${st.detail}`, now);
    return { state: "failed" };
  }

  if (Date.now() - new Date(order.updated_at || order.created_at).getTime() > STUCK_AFTER_MS) {
    const prefix = order.supplier === "ppure" ? "ppure_buff_stuck" : "tunvn_buff_stuck";
    await markBuffNeedsReconciliation(order, `${prefix}: ${order.supplier_order_id}`, now);
    return { state: "failed" };
  }

  return { state: "pending" };
}

// Backstop for orders whose customer never reopened the page (cron / admin sync).
export async function settleAllBuffOrders(limit = 10) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, status, supplier, supplier_order_id, activation_info, quantity, gifts_redeemed, unit_cost, items, updated_at, created_at")
    .eq("status", "fulfilling")
    .in("supplier", ["tunvn", "ppure"])
    .limit(limit);
  const results = await Promise.all((data || []).map((o) => settleBuffOrder(o).catch(() => ({ state: "error" }))));
  return { checked: results.length, done: results.filter((r) => r.state === "done").length };
}
