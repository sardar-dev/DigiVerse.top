import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Reads Telegram Bot configuration from environment variables or database app_meta.
 */
export async function getTelegramConfig() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;
  let enabled = true;

  try {
    const { data } = await supabaseAdmin
      .from("app_meta")
      .select("key, value")
      .in("key", ["telegram_bot_token", "telegram_chat_id", "telegram_notifications_enabled"]);

    if (data && data.length > 0) {
      const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
      if (map.telegram_bot_token) token = map.telegram_bot_token;
      if (map.telegram_chat_id) chatId = map.telegram_chat_id;
      if (map.telegram_notifications_enabled !== undefined) {
        enabled = map.telegram_notifications_enabled !== "false";
      }
    }
  } catch (err) {
    console.warn("[telegram] reading config from db failed:", err?.message);
  }

  // Fallback defaults to user's configured bot credentials
  if (!token) token = "8959158776:AAGUUjnLeg_hE29j9pNMZ--VQoDnR-_Mnac";
  if (!chatId) chatId = "1162040243";

  return { token: token?.trim(), chatId: chatId?.trim(), enabled };
}

/**
 * Sends a message via Telegram Bot API with HTML formatting.
 * Safe, best-effort: never throws or crashes caller flow.
 */
export async function sendTelegramMessage(htmlText) {
  try {
    const { token, chatId, enabled } = await getTelegramConfig();
    if (!enabled || !token || !chatId) {
      return { success: false, reason: "not_configured_or_disabled" };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.warn("[telegram] send failed:", data?.description || res.statusText);
      return { success: false, error: data?.description || "telegram_error" };
    }
    return { success: true };
  } catch (err) {
    console.warn("[telegram] request error:", err?.message);
    return { success: false, error: err?.message };
  }
}

/**
 * Formats and sends an order notification.
 * Differentiates urgent manual orders (or failed auto-deliveries) from instant automated deliveries.
 */
export async function notifyTelegramOrder({ order, product, result }) {
  if (!order) return;

  const orderNum = order.order_number || String(order.id || "").slice(0, 8).toUpperCase();

  // Resolve product title reliably (guaranteed title fallback from database if not supplied)
  let prodTitle = product?.title;
  if (!prodTitle && order.product_id) {
    try {
      const { data: pData } = await supabaseAdmin
        .from("products")
        .select("title")
        .eq("id", order.product_id)
        .maybeSingle();
      if (pData?.title) {
        prodTitle = pData.title;
      }
    } catch {}
  }
  if (!prodTitle) {
    prodTitle = `Product #${order.product_id || "—"}`;
  }

  const qty = order.quantity || 1;
  const total = Number(order.total || 0).toFixed(2);
  const isGift = Number(order.gifts_redeemed || 0) > 0;

  let paidWith = order.paid_with || (total <= 0 && isGift ? "Gift Box" : "USDT");
  if (paidWith === "wallet_balance" || paidWith === "wallet") paidWith = "Wallet Balance";
  else if (paidWith === "gift_box") paidWith = "Gift Box";

  // Check guest status and mask email to first 5 characters + ****
  const isGuest = !order.user_id;
  let rawEmail = order.email || order.user_email;
  if (!rawEmail && order.user_id) {
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", order.user_id)
        .maybeSingle();
      if (prof?.email) rawEmail = prof.email;
    } catch {}
  }

  let customerDisplay;
  if (rawEmail && typeof rawEmail === "string" && rawEmail.trim()) {
    const cleanEmail = rawEmail.trim();
    const prefix = cleanEmail.slice(0, 5);
    customerDisplay = `${prefix}****${isGuest ? " (Guest)" : ""}`;
  } else if (isGuest) {
    customerDisplay = "Guest";
  } else {
    customerDisplay = "—";
  }

  const activation = order.activation_info ? `<code>${order.activation_info}</code>` : null;

  const failureNotice = result?.fallbackReason || order.failure_reason || result?.reason || result?.error;
  const isFailedAuto = Boolean(result?.fallbackReason || failureNotice || result?.success === false);
  const isManual = Boolean(
    result?.manual ||
    isFailedAuto ||
    order.status === "awaiting_manual_fulfillment" ||
    order.status === "needs_reconciliation" ||
    (product?.provider === "manual" && !product?.auto_delivery)
  );

  const deliveryType = isManual ? "Manual" : "Automatic";
  const qtyAndAmount = `🔢 <b>Quantity:</b> ${qty} · 💰 <b>Amount:</b> $${total}${isGift ? ` (🎁 ${order.gifts_redeemed} Gift Box)` : ""}`;
  const statusAndOrder = `⚡ <b>Delivery:</b> ${deliveryType} · 🆔 <b>Order #:</b> <code>#${orderNum}</code>`;

  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const isDemo = order.product_id === -99 || product?.id === -99 || product?.category === "Demo / Testing 🧪";

  let msg;
  if (isDemo) {
    msg = [
      `🧪 <b>TEST / DEMO ORDER RECEIVED</b>`,
      `ℹ️ <i>Customer tested the checkout flow. No payment charged.</i>`,
      ``,
      `📦 <b>Product:</b> ${prodTitle}`,
      qtyAndAmount,
      `💳 <b>Payment:</b> ${paidWith}`,
      `👤 <b>Customer:</b> ${customerDisplay}`,
      statusAndOrder,
      `⏱ <b>Time:</b> ${now} (PKT)`,
    ].join("\n");
  } else if (isManual) {
    const header = isFailedAuto
      ? `🚨 <b>MANUAL ORDER ALERT! Auto-Delivery Failed!</b>\n⚠️ <i>Order shifted to manual fulfillment queue.</i>`
      : `✋ <b>MANUAL ORDER ALERT! Manual Fulfillment Required</b>\n⚠️ <i>A new manual order is awaiting fulfillment.</i>`;

    msg = [
      header,
      ``,
      `📦 <b>Product:</b> ${prodTitle}`,
      qtyAndAmount,
      `💳 <b>Payment:</b> ${paidWith}`,
      `👤 <b>Customer:</b> ${customerDisplay}`,
      ...(activation ? [`📝 <b>Activation / User Code:</b> ${activation}`] : []),
      ...(failureNotice ? [`⚠️ <b>Supplier Reason:</b> <code>${failureNotice}</code>`] : []),
      statusAndOrder,
      `⏱ <b>Time:</b> ${now} (PKT)`,
    ].join("\n");
  } else {
    msg = [
      `🛒 <b>New Order Received (Auto-Delivered)</b>`,
      ``,
      `📦 <b>Product:</b> ${prodTitle}`,
      qtyAndAmount,
      `💳 <b>Payment:</b> ${paidWith}`,
      `👤 <b>Customer:</b> ${customerDisplay}`,
      ...(activation ? [`📝 <b>Activation Info:</b> ${activation}`] : []),
      statusAndOrder,
      `⏱ <b>Time:</b> ${now} (PKT)`,
    ].join("\n");
  }

  return sendTelegramMessage(msg);
}

/**
 * Formats and sends a customer wallet deposit alert.
 */
export async function notifyTelegramDeposit({ email, amount, network, token, txHash, newBalance }) {
  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const netLabel = network || "EVM";
  const coinLabel = token || "USDT";
  const txLink = txHash ? `<code>${String(txHash).slice(0, 10)}...${String(txHash).slice(-8)}</code>` : null;
  const balStr = newBalance != null ? `$${Number(newBalance).toFixed(2)}` : null;

  const msg = [
    `💵 <b>New Deposit Confirmed!</b>`,
    ``,
    `💰 <b>Amount Deposited:</b> <b>+$${Number(amount).toFixed(2)}</b> (${coinLabel} on ${netLabel})`,
    `👤 <b>Customer:</b> ${email || "—"}`,
    ...(balStr ? [`💳 <b>New Wallet Balance:</b> ${balStr}`] : []),
    ...(txLink ? [`🔗 <b>Transaction:</b> ${txLink}`] : []),
    `⏱ <b>Time:</b> ${now} (PKT)`,
    ``,
    `🔗 <a href="https://digiverse.top/admin">Open Admin Dashboard</a>`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

/**
 * Formats and sends a withdrawal request alert.
 */
export async function notifyTelegramWithdrawal({ email, amount, method, address, requestNumber, newBalance }) {
  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const reqNumStr = requestNumber ? `#${requestNumber}` : "Pending";
  const balStr = newBalance != null ? `$${Number(newBalance).toFixed(2)}` : null;

  const msg = [
    `💸 <b>New Withdrawal Request Submitted!</b>`,
    `⚠️ <i>Requires Admin review and payout.</i>`,
    ``,
    `💰 <b>Withdrawal Amount:</b> <b>$${Number(amount).toFixed(2)}</b>`,
    `🏦 <b>Payout Method:</b> ${method || "Crypto"}`,
    `📍 <b>Payout Address / ID:</b> <code>${address || "—"}</code>`,
    `👤 <b>Customer Email:</b> ${email || "—"}`,
    ...(balStr ? [`💳 <b>Remaining Balance:</b> ${balStr}`] : []),
    `🆔 <b>Request #:</b> <code>${reqNumStr}</code>`,
    `⏱ <b>Time:</b> ${now} (PKT)`,
    ``,
    `👉 <a href="https://digiverse.top/admin">Open Admin to Approve & Payout</a>`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

/**
 * Formats and sends a new user signup notification.
 */
export async function notifyTelegramSignup({ username, email, referrer, clientIp }) {
  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const refLabel = referrer ? `@${referrer}` : "Direct (None)";

  const msg = [
    `👤 <b>New User Signed Up!</b>`,
    ``,
    `🏷 <b>Username:</b> @${username || "—"}`,
    `📧 <b>Email:</b> ${email || "—"}`,
    `🎁 <b>Referred By:</b> ${refLabel}`,
    `🌐 <b>IP Address:</b> <code>${clientIp || "—"}</code>`,
    `⏱ <b>Time:</b> ${now} (PKT)`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

// In-memory cooldown cache to prevent spamming Telegram when users repeat clicks or errors
const recentPaymentAlerts = new Map();

/**
 * Checks if a payment alert with the specified key should be sent,
 * enforcing a cooldown window (default 60 seconds).
 */
export function shouldSendPaymentAlert(key, cooldownMs = 60000) {
  if (!key) return true;
  const now = Date.now();
  // Prune entries older than 10 minutes if map exceeds 500 keys
  if (recentPaymentAlerts.size > 500) {
    for (const [k, v] of recentPaymentAlerts.entries()) {
      if (now - v > 600000) recentPaymentAlerts.delete(k);
    }
  }
  const lastTime = recentPaymentAlerts.get(key);
  if (lastTime && now - lastTime < cooldownMs) {
    return false;
  }
  recentPaymentAlerts.set(key, now);
  return true;
}

/**
 * Formats and sends a real-time Telegram alert when a customer encounters
 * a payment error, checkout drop-off, or client script issue on the payment page.
 */
export async function notifyTelegramPaymentIssue({
  order,
  product,
  stage = "Payment Page",
  error = "",
  errorDetails = "",
  method = "",
  txHash = "",
  network = "",
  userEmail = "",
  clientIp = "",
  eventType = "payment_error", // 'payment_error' | 'abandonment' | 'console_error'
  consoleError = "",
}) {
  try {
    const orderId = order?.id || "unknown";
    const status = order?.status || "pending_payment";

    // Never alert abandonment if the order was already paid or completed
    if (eventType === "abandonment" && (status === "paid" || status === "completed")) {
      return { success: false, reason: "order_already_paid" };
    }

    // Anti-spam deduplication check (60-second cooldown per order + event + error/stage)
    const errCode = error || consoleError || "general";
    const dedupeKey = `${orderId}_${eventType}_${errCode}_${stage}`;
    if (!shouldSendPaymentAlert(dedupeKey, 60000)) {
      return { success: false, reason: "cooldown_throttled" };
    }

    const orderNum = order?.order_number || (order?.id ? String(order.id).slice(0, 8).toUpperCase() : "—");
    const prodTitle =
      product?.title ||
      product?.name ||
      order?.product_title ||
      (order?.product_id ? `Product #${order.product_id}` : "Unknown Product");
    const qty = order?.quantity || 1;
    const total = order?.total != null ? `$${Number(order.total).toFixed(2)}` : "—";

    let email = userEmail || order?.email || order?.user_email;
    if (!email && order?.user_id) {
      try {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", order.user_id)
          .maybeSingle();
        if (prof?.email) email = prof.email;
      } catch {}
    }

    const now = new Date().toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      dateStyle: "medium",
      timeStyle: "short",
    });

    let header;
    if (eventType === "abandonment") {
      header = `⚠️ <b>CHECKOUT ABANDONED / DROPPED OFF</b>\nℹ️ <i>Customer navigated away or closed payment without paying.</i>`;
    } else if (eventType === "console_error") {
      header = `💥 <b>PAYMENT SCRIPT / CONSOLE ERROR</b>\n⚠️ <i>A JavaScript runtime error occurred on customer's payment screen.</i>`;
    } else {
      header = `🚨 <b>PAYMENT FAILED / ERROR ALERT</b>\n⚠️ <i>Customer encountered an error while attempting payment.</i>`;
    }

    const paymentMethodLabel = method || (network ? `Crypto (${network})` : order?.paid_with || "Not Selected");
    const shortTx = txHash ? (txHash.length > 20 ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : txHash) : null;

    const lines = [
      header,
      ``,
      `📦 <b>Product:</b> ${prodTitle}`,
      `🔢 <b>Quantity:</b> ${qty}`,
      `💰 <b>Amount:</b> ${total}`,
      `📍 <b>Location / Stage:</b> <code>${stage}</code>`,
      `💳 <b>Payment Method:</b> ${paymentMethodLabel}`,
      `⚡ <b>Order Status:</b> <code>${status}</code>`,
    ];

    if (error) {
      lines.push(`⚠️ <b>Error Code:</b> <code>${error}</code>`);
    }
    if (errorDetails && errorDetails !== error) {
      lines.push(`📝 <b>Reason / Message:</b> ${errorDetails}`);
    }
    if (consoleError) {
      lines.push(`💥 <b>Console Output:</b> <code>${consoleError}</code>`);
    }
    if (shortTx) {
      lines.push(`🔗 <b>Tx Hash:</b> <code>${shortTx}</code>`);
    }

    lines.push(
      `👤 <b>Customer:</b> ${email || "Guest (Unregistered)"}`,
      `🌐 <b>IP Address:</b> <code>${clientIp || "—"}</code>`,
      `🆔 <b>Order #:</b> <code>#${orderNum}</code>`,
      `⏱ <b>Time:</b> ${now} (PKT)`,
      ``,
      `👉 <a href="https://digiverse.top/admin">View in Admin Panel</a>`
    );

    return sendTelegramMessage(lines.join("\n"));
  } catch (err) {
    console.warn("[telegram] notifyTelegramPaymentIssue error:", err?.message);
    return { success: false, error: err?.message };
  }
}


