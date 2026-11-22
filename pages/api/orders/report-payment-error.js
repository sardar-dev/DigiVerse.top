import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { notifyTelegramPaymentIssue } from "../../../lib/telegram";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  try {
    let session = null;
    try {
      const supabaseServer = createPagesServerClient({ req, res });
      const sessionRes = await supabaseServer.auth.getSession();
      session = sessionRes.data?.session || null;
    } catch {}

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    body = body || {};

    const {
      order_id,
      stage,
      method,
      network,
      tx_hash,
      error,
      error_details,
      event_type,
      console_error,
      product_id,
      product_title,
      total,
      quantity,
    } = body;

    const clientIp =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    let order = null;
    let product = null;

    if (order_id) {
      try {
        const { data: dbOrder } = await supabaseAdmin
          .from("orders")
          .select("*, products(id, title, name, icon)")
          .eq("id", order_id)
          .maybeSingle();

        if (dbOrder) {
          order = dbOrder;
          product = dbOrder.products;
        }
      } catch (e) {
        console.warn("[report-payment-error] fetch order error:", e?.message);
      }
    }

    if (!order) {
      order = {
        id: order_id,
        order_number: order_id ? String(order_id).slice(0, 8).toUpperCase() : undefined,
        total: total,
        quantity: quantity || 1,
        status: "pending_payment",
        product_id: product_id,
      };
    }

    if (!product && (product_id || product_title)) {
      product = {
        id: product_id,
        title: product_title || `Product #${product_id}`,
      };
    }

    const userEmail = session?.user?.email || order?.email;

    await notifyTelegramPaymentIssue({
      order,
      product,
      stage: stage || "Payment Page",
      error: error || "",
      errorDetails: error_details || "",
      method: method || "",
      txHash: tx_hash || "",
      network: network || "",
      userEmail,
      clientIp,
      eventType: event_type || "payment_error",
      consoleError: console_error || "",
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.warn("[report-payment-error] error:", err?.message);
    return res.status(200).json({ success: false, error: err?.message });
  }
}

