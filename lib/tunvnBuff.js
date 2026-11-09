import { supabaseAdmin } from "./supabaseAdmin";
import * as tunvn from "./suppliers/tunvn";

// Auto-fulfilment for "Muse AI Tokens | On Your Own Account"-style products
// (products.tunvn_buff = true). The customer's invite code is the order's
// activation_info; quantity is in billions (1–30). TunVN credits the token
// asynchronously (~1–2 min), so a successful order goes to "fulfilling" with
// the TunVN batch_id saved, and settleBuffOrder() flips it to delivered later.
//
// Safety rule: a CLEAN failure before any money moved (bad code, balance too
// low, key missing, price above what the customer paid) falls back to the
// normal manual queue. An AMBIGUOUS failure (timeout, 5xx, no batch_id) never
// falls back or refunds — the wallet may already be charged, so a human checks.

const CODE_RE = /^[A-Za-z0-9_-]{4,20}$/;
const STUCK_AFTER_MS = 30 * 60 * 1000;

export async function isBuffProduct(productId) {
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("tunvn_buff")
      .eq("id", productId)
      .maybeSingle();
    return !error && Boolean(data?.tunvn_buff);
  } catch {
    return false; // column missing (migration 034 not run) → behave as before
  }
}

export function parseBuffRequest(order) {
  const code = String(order.activation_info || "").trim().toUpperCase();
  const qty = Number(order.quantity);
  if (!CODE_RE.test(code)) return null;
  if (!Number.isInteger(qty) || qty < 1 || qty > 30) return null;
  return { code, qty };
}

// → { placed: true } | { fallback: true, reason } | { ambiguous: true, reason }
export async function placeBuffOrder(order) {
  if (!tunvn.configured()) return { fallback: true, reason: "tunvn_not_configured" };
  const req = parseBuffRequest(order);
  if (!req) return { fallback: true, reason: "invalid_invite_code_or_quantity" };

  let price = null;
  try {
    price = await tunvn.buffCheck(req.code, req.qty);
  } catch (e) {
    return { fallback: true, reason: `buff_check_failed: ${e.message}` };
  }
  if (price !== null && price > Number(order.total)) {
    return { fallback: true, reason: `cost_${price}_exceeds_paid_${order.total}` };
  }

  let placed;
  try {
    placed = await tunvn.buffOrder(req.code, req.qty);
  } catch (e) {
    if (e.ambiguous) return { ambiguous: true, reason: e.message };
    const reason = e.code === "INSUFFICIENT_BALANCE" ? "TunVN wallet balance too low" : e.message;
    return { fallback: true, reason: `buff_order_rejected: ${reason}` };
  }

  const cost = placed.price ?? price;
  const patch = {
    status: "fulfilling",
    supplier: "tunvn",
    supplier_order_id: placed.batchId,
    updated_at: new Date().toISOString(),
    ...(cost !== null && cost !== undefined ? { unit_cost: Number((cost / req.qty).toFixed(6)) } : {}),
  };
  let { error } = await supabaseAdmin.from("orders").update(patch).eq("id", order.id);
  if (error) {
    // unit_cost / supplier columns are optional — never lose the batch_id.
    ({ error } = await supabaseAdmin
      .from("orders")
      .update({ status: "fulfilling", supplier: "tunvn", supplier_order_id: placed.batchId, updated_at: patch.updated_at })
      .eq("id", order.id));
  }
  if (error) return { ambiguous: true, reason: `buff_placed_but_not_saved: batch ${placed.batchId}: ${error.message}` };
  return { placed: true };
}

// Checks TunVN and settles an order that is waiting on a buff.
// → { state: "done" | "failed" | "pending" | "skip" }
export async function settleBuffOrder(order) {
  if (!order || order.status !== "fulfilling" || order.supplier !== "tunvn" || !order.supplier_order_id) {
    return { state: "skip" };
  }
  const now = new Date().toISOString();
  let st;
  try {
    st = await tunvn.buffStatus(order.supplier_order_id);
  } catch (e) {
    console.warn("[tunvnBuff] status check failed:", e?.message);
    st = { state: "pending", detail: e?.message };
  }

  if (st.state === "done") {
    const code = String(order.activation_info || "").trim().toUpperCase();
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
        items: [`Muse AI token credited to invite code ${code} (${order.quantity}B).`],
        updated_at: now,
      })
      .eq("id", order.id)
      .eq("status", "fulfilling"); // a parallel poll can't deliver twice
    if (error) console.error("[tunvnBuff] mark delivered failed:", error.message);
    return { state: "done" };
  }
  if (st.state === "failed") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "needs_reconciliation", failure_reason: `tunvn_buff_failed: ${st.detail}`, updated_at: now })
      .eq("id", order.id)
      .eq("status", "fulfilling");
    return { state: "failed" };
  }
  if (Date.now() - new Date(order.updated_at || order.created_at).getTime() > STUCK_AFTER_MS) {
    await supabaseAdmin
      .from("orders")
      .update({ status: "needs_reconciliation", failure_reason: `tunvn_buff_stuck: batch ${order.supplier_order_id}`, updated_at: now })
      .eq("id", order.id)
      .eq("status", "fulfilling");
    return { state: "failed" };
  }
  return { state: "pending" };
}

// Backstop for orders whose customer never reopened the page (daily cron).
export async function settleAllBuffOrders(limit = 10) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, status, supplier, supplier_order_id, activation_info, quantity, updated_at, created_at")
    .eq("status", "fulfilling")
    .eq("supplier", "tunvn")
    .limit(limit);
  const results = await Promise.all((data || []).map((o) => settleBuffOrder(o).catch(() => ({ state: "error" }))));
  return { checked: results.length, done: results.filter((r) => r.state === "done").length };
}
