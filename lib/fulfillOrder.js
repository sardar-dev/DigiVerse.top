import { supabaseAdmin } from "./supabaseAdmin";
import { getProduct, applyStockBuffer, purchase } from "./digitrust";

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
  const { data: product, error: productErr } = await supabaseAdmin
    .from("products")
    .select("provider, auto_delivery")
    .eq("id", order.product_id)
    .single();

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
  return fulfillDigitrustOrder(order);
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

async function fulfillDigitrustOrder(order) {
  try {
    const { product } = await getProduct(order.product_id);
    const live = applyStockBuffer(product);
    if (live.available_stock < order.quantity) {
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

    // Mark "fulfilling" before the real purchase call, so if the
    // server crashes mid-request an admin can see this order was
    // last known to be actively purchasing (not just sitting paid).
    await supabaseAdmin
      .from("orders")
      .update({ status: "fulfilling", updated_at: new Date().toISOString() })
      .eq("id", order.id);

    const result = await purchase({
      productId: order.product_id,
      quantity: order.quantity,
      email: order.email || undefined,
    });

    await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
        digitrust_order_id: result.order.id,
        items: result.order.items,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return { success: true, items: result.order.items };
  } catch (e) {
    // A network error/timeout means we genuinely don't know whether
    // DigiTrust processed the purchase — do NOT mark this "failed"
    // (which implies safe to refund), since the product might have
    // actually been delivered on their end. Flag it for a human to
    // check DigiTrust's own order history before deciding.
    const status = e.ambiguous ? "needs_reconciliation" : "failed";
    await supabaseAdmin
      .from("orders")
      .update({
        status,
        failure_reason: e.message || "fulfillment_error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return {
      success: false,
      error: e.ambiguous
        ? "fulfillment_uncertain_pending_review"
        : "fulfillment_failed_refund_pending",
    };
  }
}
