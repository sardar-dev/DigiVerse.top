import { supabaseAdmin } from "./supabaseAdmin";
import { getSupplier, resolveSource, applyBuffer, supplierLabel } from "./suppliers";

/**
 * Call this once an order's payment is already confirmed (status
 * "paid"). Branches on the product's provider:
 *  - 'digitrust': buys from DigiTrust and stores delivered items
 *    (existing behavior, unchanged).
 *  - 'manual': never touches DigiTrust. Atomically decrements our
 *    own stock and marks the order "awaiting_manual_fulfillment" for
 *    an admin to deliver by hand from /admin.
 *
 * Returns { success, items?, manual? } or { success: false, error }.
 */
export async function fulfillOrder(order) {
  let { data: product, error: productErr } = await supabaseAdmin
    .from("products")
    .select("provider, auto_delivery, active_supplier, requires_email")
    .eq("id", order.product_id)
    .single();

  if (productErr && /active_supplier/i.test(productErr.message)) {
    // migration_013 not run yet — behave exactly like before (DigiTrust).
    ({ data: product, error: productErr } = await supabaseAdmin
      .from("products")
      .select("provider, auto_delivery, requires_email")
      .eq("id", order.product_id)
      .single());
  }

  if (productErr || !product) {
    await supabaseAdmin
      .from("orders")
      .update({
        status: "failed",
        failure_reason: "product_not_found",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { success: false, error: "fulfillment_failed_refund_pending" };
  }

  if (product.provider === "manual" && product.auto_delivery) {
    return fulfillAutoDeliveryOrder(order);
  }
  if (product.provider === "manual") {
    return fulfillManualOrder(order);
  }
  return fulfillSupplierOrder(order, product);
}

// Manual product with stored "boxes": hand the customer their own
// unique box(es) right now. claim_stock_items is atomic, all-or-nothing
// and safe to retry for the same order.
async function fulfillAutoDeliveryOrder(order) {
  const { data: contents, error } = await supabaseAdmin.rpc("claim_stock_items", {
    p_product_id: order.product_id,
    p_order_id: order.id,
    p_quantity: order.quantity,
  });

  if (error) {
    await supabaseAdmin
      .from("orders")
      .update({
        status: "needs_reconciliation",
        failure_reason: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { success: false, error: "fulfillment_uncertain_pending_review" };
  }

  if (!contents || contents.length === 0) {
    await supabaseAdmin
      .from("orders")
      .update({
        status: "failed",
        failure_reason: "out_of_stock_at_fulfillment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { success: false, error: "out_of_stock_refund_pending" };
  }

  await supabaseAdmin
    .from("orders")
    .update({ status: "delivered", items: contents, updated_at: new Date().toISOString() })
    .eq("id", order.id);

  return { success: true, items: contents };
}

async function fulfillManualOrder(order) {
  const { data: newStock, error } = await supabaseAdmin.rpc(
    "decrement_manual_stock",
    { p_product_id: order.product_id, p_quantity: order.quantity }
  );

  if (error) {
    // Genuinely unexpected DB error — don't guess, flag for a human.
    await supabaseAdmin
      .from("orders")
      .update({
        status: "needs_reconciliation",
        failure_reason: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { success: false, error: "fulfillment_uncertain_pending_review" };
  }

  if (newStock === null) {
    // The WHERE available_stock >= quantity clause matched no row —
    // genuinely out of stock at this exact moment.
    await supabaseAdmin
      .from("orders")
      .update({
        status: "failed",
        failure_reason: "out_of_stock_at_fulfillment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { success: false, error: "out_of_stock_refund_pending" };
  }

  await supabaseAdmin
    .from("orders")
    .update({
      status: "awaiting_manual_fulfillment",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  return { success: true, manual: true };
}

// Marks the order failed/needs_reconciliation in one place.
async function failOrder(order, status, reason) {
  await supabaseAdmin
    .from("orders")
    .update({ status, failure_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", order.id);
}

// Writes the delivered result. Tries the new supplier columns first and
// quietly falls back if migration_013 hasn't been run.
async function markDelivered(order, supplierId, result) {
  const base = { status: "delivered", items: result.items, updated_at: new Date().toISOString() };
  const withSupplier = {
    ...base,
    supplier: supplierId,
    supplier_order_id: result.supplierOrderId,
    ...(supplierId === "digitrust" && /^\d+$/.test(result.supplierOrderId || "")
      ? { digitrust_order_id: Number(result.supplierOrderId) }
      : {}),
  };
  let { error } = await supabaseAdmin.from("orders").update(withSupplier).eq("id", order.id);
  if (error && /supplier/i.test(error.message)) {
    ({ error } = await supabaseAdmin
      .from("orders")
      .update({
        ...base,
        ...(withSupplier.digitrust_order_id ? { digitrust_order_id: withSupplier.digitrust_order_id } : {}),
      })
      .eq("id", order.id));
  }
  return error;
}

// Buys from whichever supplier is the product's active source. There is
// deliberately NO fallback to another supplier: if this one fails, the
// order fails (refund pending) rather than silently buying elsewhere.
async function fulfillSupplierOrder(order, product) {
  const src = await resolveSource({ ...product, id: order.product_id });
  const supplier = src && (await getSupplier(src.supplier));
  if (!supplier) {
    await failOrder(order, "failed", "supplier_not_available");
    return { success: false, error: "fulfillment_failed_refund_pending" };
  }
  if (product.requires_email && !supplier.supportsEmail) {
    await failOrder(order, "failed", `${supplier.id}_cannot_take_email`);
    return { success: false, error: "fulfillment_failed_refund_pending" };
  }

  try {
    const live = await supplier.api.getProduct(src.supplierProductId);
    if (applyBuffer(live.stock) < order.quantity) {
      await failOrder(order, "failed", "out_of_stock_at_fulfillment");
      return { success: false, error: "out_of_stock_refund_pending" };
    }

    // Record what this purchase really costs us, for accurate profit stats.
    if (Number.isFinite(live.cost)) {
      try {
        await supabaseAdmin.from("orders").update({ unit_cost: live.cost }).eq("id", order.id);
      } catch {}
    }

    // Mark "fulfilling" before the real purchase call, so if the
    // server crashes mid-request an admin can see this order was
    // last known to be actively purchasing (not just sitting paid).
    {
      const fulfilling = { status: "fulfilling", updated_at: new Date().toISOString() };
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ ...fulfilling, supplier: supplier.id })
        .eq("id", order.id);
      if (error && /supplier/i.test(error.message)) {
        await supabaseAdmin.from("orders").update(fulfilling).eq("id", order.id);
      }
    }

    const buy = () =>
      supplier.api.purchase({
        productId: src.supplierProductId,
        quantity: order.quantity,
        email: order.email || undefined,
        orderId: order.id,
      });

    let result;
    try {
      result = await buy();
    } catch (e) {
      // XPro purchases are idempotent on our order id, so one retry after
      // a timeout can never double-charge. DigiTrust has no such key, so
      // it is never retried automatically.
      if (e.ambiguous && supplier.idempotent) result = await buy();
      else throw e;
    }

    if (result.items.length !== order.quantity) {
      // Supplier charged us but the line count is off — keep what we got.
      await supabaseAdmin
        .from("orders")
        .update({ items: result.items, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      await failOrder(order, "needs_reconciliation", `${supplier.id}_line_count_mismatch`);
      return { success: false, error: "fulfillment_uncertain_pending_review" };
    }

    const saveErr = await markDelivered(order, supplier.id, result);
    if (saveErr) {
      // Bought and delivered upstream but we couldn't save — never retry.
      await failOrder(order, "needs_reconciliation", `delivered_but_not_saved: ${saveErr.message}`);
      return { success: false, error: "fulfillment_uncertain_pending_review" };
    }
    return { success: true, items: result.items };
  } catch (e) {
    // A network error/timeout means we genuinely don't know whether the
    // supplier processed the purchase — do NOT mark this "failed"
    // (which implies safe to refund). Flag it for a human instead.
    const status = e.ambiguous ? "needs_reconciliation" : "failed";
    const reason =
      e.code === "INSUFFICIENT_BALANCE"
        ? `${supplier.label || supplierLabel(supplier.id)} wallet balance too low`
        : e.message || "fulfillment_error";
    await failOrder(order, status, reason);
    return {
      success: false,
      error: e.ambiguous
        ? "fulfillment_uncertain_pending_review"
        : "fulfillment_failed_refund_pending",
    };
  }
}

/**
 * Admin-triggered retry for an order stuck in needs_reconciliation at an
 * idempotent supplier (XPro). Sending the same externalOrderId returns
 * the already-created order instead of charging again, so this is safe
 * even if the first attempt actually went through.
 */
export async function retrySupplierOrder(orderId) {
  const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { success: false, error: "order_not_found" };
  if (order.status !== "needs_reconciliation") return { success: false, error: "not_stuck" };
  const supplier = await getSupplier(order.supplier);
  if (!supplier || !supplier.idempotent) return { success: false, error: "retry_not_supported" };

  const { data: source } = await supabaseAdmin
    .from("product_sources")
    .select("supplier_product_id")
    .eq("product_id", order.product_id)
    .eq("supplier", supplier.id)
    .maybeSingle();
  if (!source) return { success: false, error: "source_not_found" };

  // Atomic claim so two admin clicks can't run two retries at once.
  const { data: claimed } = await supabaseAdmin
    .from("orders")
    .update({ status: "fulfilling", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "needs_reconciliation")
    .select("id")
    .maybeSingle();
  if (!claimed) return { success: false, error: "already_processing" };

  try {
    const result = await supplier.api.purchase({
      productId: source.supplier_product_id,
      quantity: order.quantity,
      orderId: order.id,
    });
    if (result.items.length !== order.quantity) {
      await supabaseAdmin.from("orders").update({ items: result.items }).eq("id", order.id);
      await failOrder(order, "needs_reconciliation", `${supplier.id}_line_count_mismatch`);
      return { success: false, error: "line_count_mismatch" };
    }
    const saveErr = await markDelivered(order, supplier.id, result);
    if (saveErr) {
      await failOrder(order, "needs_reconciliation", `delivered_but_not_saved: ${saveErr.message}`);
      return { success: false, error: "save_failed" };
    }
    return { success: true, items: result.items, duplicate: result.duplicate };
  } catch (e) {
    // Clean "no" from the supplier = nothing purchased: safe to fail for refund.
    await failOrder(order, e.ambiguous ? "needs_reconciliation" : "failed", e.message || "retry_failed");
    return { success: false, error: e.ambiguous ? "still_uncertain" : "supplier_rejected", message: e.message };
  }
}
