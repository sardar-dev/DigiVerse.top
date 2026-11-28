import { supabaseAdmin } from "./supabaseAdmin";
import { CRYPTO_NETWORKS } from "./cryptoNetworks";

const TELEGRAM_TIMEOUT_MS = 4500;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getExplorerTxUrl(networkId, txHash) {
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(String(txHash).trim())) return null;
  const base = CRYPTO_NETWORKS[networkId]?.explorerTx || "https://bscscan.com/tx/";
  return `${base}${encodeURIComponent(String(txHash).trim())}`;
}

function formatTxDisplay(txHash, networkId) {
  if (!txHash) return null;
  const clean = String(txHash).trim();
  const short = clean.length > 20 ? `${clean.slice(0, 10)}...${clean.slice(-8)}` : clean;
  const explorerUrl = getExplorerTxUrl(networkId, clean);
  return explorerUrl
    ? `<a href="${explorerUrl}">${escapeHtml(short)}</a>`
    : `<code>${escapeHtml(short)}</code>`;
}

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
      if (map.telegram_bot_token?.trim()) token = map.telegram_bot_token.trim();
      if (map.telegram_chat_id?.trim()) chatId = map.telegram_chat_id.trim();
      if (map.telegram_notifications_enabled !== undefined) {
        enabled = map.telegram_notifications_enabled !== "false";
      }
    }
  } catch (err) {
    console.warn("[telegram] reading config from db failed:", err?.message);
  }

  // Fallback defaults to user's configured bot credentials
  if (!token?.trim()) token = "8959158776:AAGUUjnLeg_hE29j9pNMZ--VQoDnR-_Mnac";
  if (!chatId?.trim()) chatId = "1162040243";

  return { token: token?.trim(), chatId: chatId?.trim(), enabled };
}

/**
 * Sends a message via Telegram Bot API with HTML formatting.
 * Bounded by a short timeout so awaited alerts complete reliably on Vercel
 * without ever stalling payment or deposit responses.
 */
export async function sendTelegramMessage(htmlText) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const { token, chatId, enabled } = await getTelegramConfig();
    if (!enabled || !token || !chatId) {
      return { success: false, reason: "not_configured_or_disabled" };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves common order metadata (product title, masked customer label, formatted time)
 * shared by order-placed and order-fulfilled notifications.
 */
async function resolveOrderTelegramMeta(order, product) {
  const orderNum = order.order_number || String(order.id || "").slice(0, 8).toUpperCase();

  let prodTitle = product?.title;
  if (!prodTitle && order.product_id) {
    try {
      const { data: pData } = await supabaseAdmin
        .from("products")
        .select("title")
        .eq("id", order.product_id)
        .maybeSingle();
      if (pData?.title) prodTitle = pData.title;
    } catch {}
  }
  if (!prodTitle) {
    prodTitle = `Product #${order.product_id || "—"}`;
  }

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

  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const isDemo = order.product_id === -99 || product?.id === -99 || product?.category === "Demo / Testing 🧪";

  return {
    orderNum,
    prodTitle,
    customerDisplay,
    now,
    isDemo,
    qty: order.quantity || 1,
    total: Number(order.total || 0).toFixed(2),
    isGift: Number(order.gifts_redeemed || 0) > 0,
    activation: order.activation_info ? `<code>${escapeHtml(order.activation_info)}</code>` : null,
  };
}

/**
 * Formats and sends a notification immediately when a customer places a new order
 * (awaiting payment). Paid $0 gift orders go straight to notifyTelegramOrder instead.
 */
export async function notifyTelegramOrderCreated({ order, product, clientIp = "" }) {
  if (!order) return;

  const {
    orderNum,
    prodTitle,
    customerDisplay,
    now,
    isDemo,
    qty,
    total,
    isGift,
    activation,
  } = await resolveOrderTelegramMeta(order, product);

  const safeTitle = escapeHtml(prodTitle);
  const safeCustomer = escapeHtml(customerDisplay);
  const safeOrderNum = escapeHtml(orderNum);

  const header = isDemo
    ? `🧪 <b>Demo Order Placed (Checkout Opened)</b>`
    : `📝 <b>New Order Placed (Awaiting Payment)</b>`;

  const lines = [
    header,
    ``,
    `📦 <b>Product:</b> ${safeTitle}`,
    `🔢 <b>Quantity:</b> ${qty} · 💰 <b>Total:</b> $${total}${isGift ? ` (🎁 ${order.gifts_redeemed} Gift Box)` : ""}`,
    `👤 <b>Customer:</b> ${safeCustomer}`,
    ...(activation ? [`📝 <b>Customer Input:</b> ${activation}`] : []),
    `⏳ <b>Status:</b> <code>Pending Payment</code> · 🆔 <b>Order #:</b> <code>#${safeOrderNum}</code>`,
    ...(clientIp ? [`🌐 <b>IP Address:</b> <code>${escapeHtml(clientIp)}</code>`] : []),
    `⏱ <b>Time:</b> ${now} (PKT)`,
  ];

  return sendTelegramMessage(lines.join("\n"));
}

/**
 * Formats and sends an order notification.
 * Differentiates urgent manual orders (or failed auto-deliveries) from instant automated deliveries.
 */
export async function notifyTelegramOrder({ order, product, result }) {
  if (!order) return;

  const {
    orderNum,
    prodTitle,
    customerDisplay,
    now,
    isDemo,
    qty,
    total,
    isGift,
    activation,
  } = await resolveOrderTelegramMeta(order, product);

  let paidWith = order.paid_with || (Number(total) <= 0 && isGift ? "Gift Box" : "USDT");
  if (paidWith === "wallet_balance" || paidWith === "wallet") paidWith = "Wallet Balance";
  else if (paidWith === "gift_box") paidWith = "Gift Box";

  const safeTitle = escapeHtml(prodTitle);
  const safePaidWith = escapeHtml(paidWith);
  const safeCustomer = escapeHtml(customerDisplay);
  const safeOrderNum = escapeHtml(orderNum);

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
  const statusAndOrder = `⚡ <b>Delivery:</b> ${deliveryType} · 🆔 <b>Order #:</b> <code>#${safeOrderNum}</code>`;

  let msg;
  if (isDemo) {
    msg = [
      `🧪 <b>TEST / DEMO ORDER RECEIVED</b>`,
      `ℹ️ <i>Customer tested the checkout flow. No payment charged.</i>`,
      ``,
      `📦 <b>Product:</b> ${safeTitle}`,
      qtyAndAmount,
      `💳 <b>Payment:</b> ${safePaidWith}`,
      `👤 <b>Customer:</b> ${safeCustomer}`,
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
      `📦 <b>Product:</b> ${safeTitle}`,
      qtyAndAmount,
      `💳 <b>Payment:</b> ${safePaidWith}`,
      `👤 <b>Customer:</b> ${safeCustomer}`,
      ...(activation ? [`📝 <b>Activation / User Code:</b> ${activation}`] : []),
      ...(failureNotice ? [`⚠️ <b>Supplier Reason:</b> <code>${escapeHtml(failureNotice)}</code>`] : []),
      statusAndOrder,
      `⏱ <b>Time:</b> ${now} (PKT)`,
    ].join("\n");
  } else {
    msg = [
      `🛒 <b>New Order Received (Auto-Delivered)</b>`,
      ``,
      `📦 <b>Product:</b> ${safeTitle}`,
      qtyAndAmount,
      `💳 <b>Payment:</b> ${safePaidWith}`,
      `👤 <b>Customer:</b> ${safeCustomer}`,
      ...(activation ? [`📝 <b>Activation Info:</b> ${activation}`] : []),
      statusAndOrder,
      `⏱ <b>Time:</b> ${now} (PKT)`,
    ].join("\n");
  }

  return sendTelegramMessage(msg);
}

/**
 * Formats and sends a customer wallet deposit alert (on-chain top-up or manual admin credit).
 */
export async function notifyTelegramDeposit({
  email,
  amount,
  uniqueAmount,
  network,
  networkId,
  token,
  txHash,
  newBalance,
  method = "onchain",
  reason = "",
  creditedBy = "",
}) {
  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const netLabel = escapeHtml(network || CRYPTO_NETWORKS[networkId]?.networkName || "EVM");
  const coinLabel = escapeHtml(token || CRYPTO_NETWORKS[networkId]?.token || "USDT");
  const txDisplay = formatTxDisplay(txHash, networkId);
  const balStr = newBalance != null ? `$${Number(newBalance).toFixed(2)}` : null;
  const isManualCredit = method === "manual_credit";

  const showExact =
    !isManualCredit &&
    uniqueAmount != null &&
    Number.isFinite(Number(uniqueAmount)) &&
    Math.abs(Number(uniqueAmount) - Number(amount)) > 0.00001;

  const msg = isManualCredit
    ? [
        `🏦 <b>Manual Deposit / Wallet Credit</b>`,
        ``,
        `💰 <b>Amount Credited:</b> <b>+$${Number(amount).toFixed(2)}</b>`,
        `👤 <b>Customer:</b> ${escapeHtml(email || "—")}`,
        ...(balStr ? [`💳 <b>New Wallet Balance:</b> ${balStr}`] : []),
        ...(reason ? [`📝 <b>Reason:</b> ${escapeHtml(reason)}`] : []),
        ...(creditedBy ? [`🛡️ <b>Credited By:</b> ${escapeHtml(creditedBy)}`] : []),
        `⏱ <b>Time:</b> ${now} (PKT)`,
        ``,
        `🔗 <a href="https://digiverse.top/admin">Open Admin Dashboard</a>`,
      ].join("\n")
    : [
        `💵 <b>New Deposit Confirmed!</b>`,
        ``,
        `💰 <b>Amount Deposited:</b> <b>+$${Number(amount).toFixed(2)}</b> (${coinLabel} on ${netLabel})`,
        ...(showExact ? [`🧾 <b>Exact On-Chain Sent:</b> <code>$${Number(uniqueAmount).toFixed(4)} ${coinLabel}</code>`] : []),
        `👤 <b>Customer:</b> ${escapeHtml(email || "—")}`,
        ...(balStr ? [`💳 <b>New Wallet Balance:</b> ${balStr}`] : []),
        ...(txDisplay ? [`🔗 <b>Transaction:</b> ${txDisplay}`] : []),
        `⏱ <b>Time:</b> ${now} (PKT)`,
        ``,
        `🔗 <a href="https://digiverse.top/admin">Open Admin Dashboard</a>`,
      ].join("\n");

  return sendTelegramMessage(msg);
}

/**
 * Alerts admin when a customer encounters an actionable wallet deposit verification failure
 * (e.g. amount mismatch where crypto was sent without exact decimal suffix, wrong recipient, etc.).
 */
export async function notifyTelegramDepositIssue({
  email = "",
  requestedAmount = null,
  uniqueAmount = null,
  receivedAmount = null,
  network = "",
  networkId = "",
  token = "",
  txHash = "",
  error = "",
  errorDetails = "",
  clientIp = "",
}) {
  try {
    const dedupeKey = `deposit_${email || clientIp || "user"}_${error || "issue"}_${txHash || "nohash"}`;
    if (!shouldSendPaymentAlert(dedupeKey, 60000)) {
      return { success: false, reason: "cooldown_throttled" };
    }

    const now = new Date().toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const netLabel = escapeHtml(network || CRYPTO_NETWORKS[networkId]?.networkName || "EVM");
    const coinLabel = escapeHtml(token || CRYPTO_NETWORKS[networkId]?.token || "USDT");
    const txDisplay = formatTxDisplay(txHash, networkId);

    const lines = [
      `⚠️ <b>WALLET DEPOSIT VERIFICATION ISSUE</b>`,
      `ℹ️ <i>Customer attempted to verify a wallet deposit that did not auto-credit.</i>`,
      ``,
      `👤 <b>Customer:</b> ${escapeHtml(email || "—")}`,
      ...(requestedAmount != null ? [`💵 <b>Requested Top-up:</b> $${Number(requestedAmount).toFixed(2)}`] : []),
      ...(uniqueAmount != null ? [`🎯 <b>Expected Exact Amount:</b> <code>$${Number(uniqueAmount).toFixed(4)}</code>`] : []),
      ...(receivedAmount != null ? [`📥 <b>Received On-Chain:</b> <b>$${Number(receivedAmount).toFixed(4)}</b> (${coinLabel} on ${netLabel})`] : [`🌐 <b>Network Selected:</b> ${coinLabel} on ${netLabel}`]),
      `⚠️ <b>Error Code:</b> <code>${escapeHtml(error || "unknown")}</code>`,
      ...(errorDetails ? [`📝 <b>Details:</b> ${escapeHtml(errorDetails)}`] : []),
      ...(txDisplay ? [`🔗 <b>Transaction:</b> ${txDisplay}`] : []),
      ...(clientIp ? [`🌐 <b>IP Address:</b> <code>${escapeHtml(clientIp)}</code>`] : []),
      `⏱ <b>Time:</b> ${now} (PKT)`,
      ``,
      `👉 <a href="https://digiverse.top/admin">Review in Admin Panel</a>`,
    ];

    return sendTelegramMessage(lines.join("\n"));
  } catch (err) {
    console.warn("[telegram] notifyTelegramDepositIssue error:", err?.message);
    return { success: false, error: err?.message };
  }
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
    `🏦 <b>Payout Method:</b> ${escapeHtml(method || "Crypto")}`,
    `📍 <b>Payout Address / ID:</b> <code>${escapeHtml(address || "—")}</code>`,
    `👤 <b>Customer Email:</b> ${escapeHtml(email || "—")}`,
    ...(balStr ? [`💳 <b>Remaining Balance:</b> ${balStr}`] : []),
    `🆔 <b>Request #:</b> <code>${escapeHtml(reqNumStr)}</code>`,
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
    `🏷 <b>Username:</b> @${escapeHtml(username || "—")}`,
    `📧 <b>Email:</b> ${escapeHtml(email || "—")}`,
    `🎁 <b>Referred By:</b> ${escapeHtml(refLabel)}`,
    `🌐 <b>IP Address:</b> <code>${escapeHtml(clientIp || "—")}</code>`,
    `⏱ <b>Time:</b> ${now} (PKT)`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

async function resolveUniqueUsername(userId, rawUsername, email) {
  let baseUser = String(rawUsername || (email ? email.split("@")[0] : "") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (baseUser.length < 3) baseUser = `user_${String(userId).slice(0, 5)}`;
  if (baseUser.length > 18) baseUser = baseUser.slice(0, 18);

  let candidate = baseUser;
  for (let i = 0; i < 8; i++) {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", candidate)
      .neq("id", userId)
      .maybeSingle();
    if (!existing) return candidate;
    candidate = `${baseUser.slice(0, 17)}_${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${baseUser.slice(0, 14)}_${String(userId).slice(0, 4)}`;
}

/**
 * Ensures a user's profile row exists and fires notifyTelegramSignup() once,
 * even if the Postgres trigger pre-created the profile or migration 051 hasn't run yet.
 */
export async function ensureProfileAndNotifySignup({
  userId,
  email = null,
  username = null,
  referrer = null,
  deviceId = null,
  clientIp = "",
  createdAt = null,
}) {
  if (!userId) return { username: null, notified: false, profile: null };

  let hasSignupNotifiedCol = true;
  let { data: profRow, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, signup_notified, username, email, device_id, referred_by, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (profErr && /signup_notified/i.test(profErr.message)) {
    hasSignupNotifiedCol = false;
    ({ data: profRow } = await supabaseAdmin
      .from("profiles")
      .select("id, username, email, device_id, referred_by, created_at")
      .eq("id", userId)
      .maybeSingle());
  }

  let currentUsername = profRow?.username;
  if (!currentUsername) {
    currentUsername = await resolveUniqueUsername(userId, username, email || profRow?.email);
  }

  let shouldNotify = false;

  if (!profRow) {
    const payload = {
      id: userId,
      email: email || null,
      username: currentUsername,
      device_id: deviceId || null,
      ...(clientIp ? { registration_ip: clientIp } : {}),
      ...(hasSignupNotifiedCol ? { signup_notified: true } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    };
    let { data: inserted, error: insErr } = await supabaseAdmin
      .from("profiles")
      .insert(payload)
      .select("id, username, email, device_id, referred_by, created_at")
      .maybeSingle();

    // Retry without optional columns if an older schema lacks registration_ip/signup_notified
    if (insErr && /registration_ip|signup_notified/i.test(insErr.message)) {
      const fallbackPayload = {
        id: userId,
        email: email || null,
        username: currentUsername,
        device_id: deviceId || null,
      };
      ({ data: inserted, error: insErr } = await supabaseAdmin
        .from("profiles")
        .insert(fallbackPayload)
        .select("id, username, email, device_id, referred_by, created_at")
        .maybeSingle());
    }

    if (!insErr && inserted) {
      profRow = inserted;
      shouldNotify = true;
      if (!hasSignupNotifiedCol) {
        await supabaseAdmin
          .from("app_meta")
          .upsert({ key: `signup_alert_${userId}`, value: "1", updated_at: new Date().toISOString() })
          .catch(() => {});
      }
    } else if (insErr?.code === "23505") {
      // Trigger or concurrent call created the row moments earlier — re-fetch to claim
      const cols = hasSignupNotifiedCol
        ? "id, signup_notified, username, email, device_id, referred_by, created_at"
        : "id, username, email, device_id, referred_by, created_at";
      const refetch = await supabaseAdmin.from("profiles").select(cols).eq("id", userId).maybeSingle();
      profRow = refetch.data || null;
      if (profRow?.username) currentUsername = profRow.username;
    }
  }

  if (profRow && !shouldNotify) {
    const updates = {};
    if (!profRow.username && currentUsername) updates.username = currentUsername;
    if (!profRow.email && email) updates.email = email;
    if (!profRow.device_id && deviceId) updates.device_id = deviceId;

    if (hasSignupNotifiedCol && profRow.signup_notified !== true) {
      const { data: claimed } = await supabaseAdmin
        .from("profiles")
        .update({ ...updates, signup_notified: true })
        .eq("id", userId)
        .or("signup_notified.is.false,signup_notified.is.null")
        .select("id")
        .maybeSingle();
      if (claimed) shouldNotify = true;
    } else {
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("profiles").update(updates).eq("id", userId);
      }
      if (!hasSignupNotifiedCol) {
        const createdMs = profRow.created_at ? new Date(profRow.created_at).getTime() : Date.now();
        const isRecent = Number.isFinite(createdMs) && Date.now() - createdMs < 15 * 60 * 1000;
        if (isRecent) {
          const { error: markerErr } = await supabaseAdmin.from("app_meta").insert({
            key: `signup_alert_${userId}`,
            value: "1",
            updated_at: new Date().toISOString(),
          });
          if (!markerErr) shouldNotify = true;
        }
      }
    }
  }

  let notified = false;
  if (shouldNotify) {
    try {
      const res = await notifyTelegramSignup({
        username: currentUsername,
        email: email || profRow?.email || "—",
        referrer: referrer || null,
        clientIp: clientIp || "—",
      });
      notified = Boolean(res?.success);
    } catch (e) {
      console.warn("[telegram] signup alert error:", e?.message);
    }
  }

  return { username: currentUsername, notified, profile: profRow };
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
    const txDisplay = formatTxDisplay(txHash, network);

    const lines = [
      header,
      ``,
      `📦 <b>Product:</b> ${escapeHtml(prodTitle)}`,
      `🔢 <b>Quantity:</b> ${qty}`,
      `💰 <b>Amount:</b> ${escapeHtml(total)}`,
      `📍 <b>Location / Stage:</b> <code>${escapeHtml(stage)}</code>`,
      `💳 <b>Payment Method:</b> ${escapeHtml(paymentMethodLabel)}`,
      `⚡ <b>Order Status:</b> <code>${escapeHtml(status)}</code>`,
    ];

    if (error) {
      lines.push(`⚠️ <b>Error Code:</b> <code>${escapeHtml(error)}</code>`);
    }
    if (errorDetails && errorDetails !== error) {
      lines.push(`📝 <b>Reason / Message:</b> ${escapeHtml(errorDetails)}`);
    }
    if (consoleError) {
      lines.push(`💥 <b>Console Output:</b> <code>${escapeHtml(consoleError)}</code>`);
    }
    if (txDisplay) {
      lines.push(`🔗 <b>Tx Hash:</b> ${txDisplay}`);
    }

    lines.push(
      `👤 <b>Customer:</b> ${escapeHtml(email || "Guest (Unregistered)")}`,
      `🌐 <b>IP Address:</b> <code>${escapeHtml(clientIp || "—")}</code>`,
      `🆔 <b>Order #:</b> <code>#${escapeHtml(orderNum)}</code>`,
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


