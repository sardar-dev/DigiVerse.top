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
  const prodTitle = product?.title || product?.name || `Product #${order.product_id}`;
  const qty = order.quantity || 1;
  const total = Number(order.total || 0).toFixed(2);
  const isGift = Number(order.gifts_redeemed || 0) > 0;
  const paidWith = order.paid_with || (total <= 0 && isGift ? "Gift Box" : "USDT");

  let email = order.email || order.user_email;
  if (!email && order.user_id) {
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", order.user_id)
        .maybeSingle();
      if (prof?.email) email = prof.email;
    } catch {}
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

  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  let msg;
  if (isManual) {
    const header = isFailedAuto
      ? `🚨 <b>MANUAL ORDER ALERT! Auto-Delivery Failed!</b>\n⚠️ <i>Order could not be delivered automatically and shifted to manual queue.</i>`
      : `✋ <b>MANUAL ORDER ALERT! Manual Fulfillment Required</b>\n⚠️ <i>A new manual order is awaiting fulfillment.</i>`;

    msg = [
      header,
      ``,
      `📦 <b>Product:</b> ${prodTitle}`,
      `🔢 <b>Quantity:</b> ${qty}`,
      `💰 <b>Amount:</b> $${total} ${isGift ? `(🎁 ${order.gifts_redeemed} Gift Box)` : ""}`,
      `💳 <b>Payment:</b> ${paidWith}`,
      `👤 <b>Customer:</b> ${email || "—"}`,
      ...(activation ? [`📝 <b>Activation / User Code:</b> ${activation}`] : []),
      ...(failureNotice ? [`⚠️ <b>Supplier Reason:</b> <code>${failureNotice}</code>`] : []),
      `🆔 <b>Order #:</b> <code>#${orderNum}</code>`,
      `⏱ <b>Time:</b> ${now} (PKT)`,
      ``,
      `👉 <a href="https://digiverse.top/admin">Open Admin to Deliver or Refund</a>`,
    ].join("\n");
  } else {
    msg = [
      `🛒 <b>New Order Received (Auto-Delivered)</b>`,
      ``,
      `📦 <b>Product:</b> ${prodTitle}`,
      `🔢 <b>Quantity:</b> ${qty}`,
      `💰 <b>Amount:</b> $${total} ${isGift ? `(🎁 ${order.gifts_redeemed} Gift Box)` : ""}`,
      `💳 <b>Payment:</b> ${paidWith}`,
      `👤 <b>Customer:</b> ${email || "—"}`,
      ...(activation ? [`📝 <b>Activation Info:</b> ${activation}`] : []),
      `⚡ <b>Status:</b> Instant Automated Delivery`,
      `🆔 <b>Order #:</b> <code>#${orderNum}</code>`,
      `⏱ <b>Time:</b> ${now} (PKT)`,
      ``,
      `🔗 <a href="https://digiverse.top/admin">View in Admin Panel</a>`,
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
    `⏱ <b>Time:</b> ${now}`,
    ``,
    `🔗 <a href="https://digiverse.top/admin">Open Admin Dashboard</a>`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

