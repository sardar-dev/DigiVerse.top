// Ppure Store Buyer API v1 client (server-side only).
// Docs: https://api.mzscan.top/en   Base: https://api.mzscan.top/api/v1
// Auth: Authorization: Bearer <PPURE_API_KEY>

const BASE = "https://api.mzscan.top/api/v1";
const AUTH_COOLDOWN_MS = 5 * 60 * 1000;
let authFailedAt = 0;

export const DEFAULT_BOOST_SKU_ID =
  (process.env.PPURE_BOOST_SKU_ID || "").trim() || "57471517-6dd5-437f-9bc7-5782aa8f8d3a";

const key = () => (process.env.PPURE_API_KEY || "").trim();
export const configured = () => Boolean(key());

const CLEAN_CODES = new Set([
  "invalid_request",
  "unauthorized",
  "insufficient_balance",
  "api_access_off",
  "not_found",
  "out_of_stock",
  "price_changed",
  "order_refused",
  "invalid_fields",
  "rate_limited",
  "sales_paused",
  "maintenance",
  "payment_returned",
]);

const AMBIGUOUS_CODES = new Set(["internal", "payment_in_progress", "idempotency_conflict"]);

async function call(path, { method = "GET", body, headers = {}, timeoutMs = 8500, mutating = false } = {}) {
  if (!configured()) {
    const err = new Error("PPURE_API_KEY is not set");
    err.code = "not_configured";
    err.ambiguous = false;
    throw err;
  }
  if (authFailedAt && Date.now() - authFailedAt < AUTH_COOLDOWN_MS) {
    const err = new Error("Ppure Store rejected the API key — check PPURE_API_KEY");
    err.code = "unauthorized";
    err.ambiguous = false;
    throw err;
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${key()}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const msg = e?.name === "TimeoutError" || e?.name === "AbortError" ? "Ppure Store request timed out" : e?.message || "Network error";
    const err = new Error(msg);
    err.ambiguous = mutating;
    throw err;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const errCode = data?.error?.code || "";
    const errMsg = data?.error?.message || `Ppure Store API error (${res.status})`;
    if (res.status === 401 || res.status === 403) {
      authFailedAt = Date.now();
    }
    const err = new Error(String(errMsg).slice(0, 200));
    err.status = res.status;
    err.code = errCode || (res.status === 402 ? "insufficient_balance" : `http_${res.status}`);
    err.requestId = data?.request_id || null;
    if (mutating) {
      if (AMBIGUOUS_CODES.has(errCode)) err.ambiguous = true;
      else if (CLEAN_CODES.has(errCode)) err.ambiguous = false;
      else err.ambiguous = res.status >= 500;
    } else {
      err.ambiguous = false;
    }
    throw err;
  }

  if (!data || typeof data !== "object") {
    const err = new Error(`Ppure Store returned an invalid response (${res.status})`);
    err.status = res.status;
    err.ambiguous = mutating;
    throw err;
  }
  return data;
}

export async function getBalance() {
  const data = await call("/me", { timeoutMs: 7000 });
  const bal = data.balance !== null && data.balance !== undefined && data.balance !== ""
    ? Number(data.balance)
    : null;
  return {
    balance: Number.isFinite(bal) ? bal : null,
    currency: data.currency || "USDT",
    accountId: data.account_id || null,
    raw: data,
  };
}

export async function listProducts() {
  const data = await call("/products", { timeoutMs: 7000 });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getBoostSku(skuId = DEFAULT_BOOST_SKU_ID) {
  const data = await call(`/products/${encodeURIComponent(skuId)}`, { timeoutMs: 5000 });
  const price = data?.price !== null && data?.price !== undefined ? Number(data.price) : null;
  return {
    id: data.id || skuId,
    product: data.product_en || data.product || "Muse Token Invite Boost",
    plan: data.plan_en || data.plan || "Invite Boost",
    price: Number.isFinite(price) ? price : null,
    currency: data.currency || "USDT",
    stock: data.stock ?? null,
    minQuantity: Number(data.min_quantity) || 1,
    maxQuantity: Number(data.max_quantity) || 30,
    delivery: data.delivery || "supplier",
    fields: Array.isArray(data.fields) ? data.fields : [],
    raw: data,
  };
}

export async function createBoostOrder({
  skuId = DEFAULT_BOOST_SKU_ID,
  quantity,
  inviteCode,
  maxAmount,
  idempotencyKey,
}) {
  const body = {
    sku_id: skuId,
    quantity: Number(quantity),
    fields: { invite: String(inviteCode || "").trim() },
    ...(maxAmount !== undefined && maxAmount !== null ? { max_amount: String(maxAmount) } : {}),
  };
  const data = await call("/orders", {
    method: "POST",
    mutating: true,
    timeoutMs: 9000,
    headers: { "Idempotency-Key": idempotencyKey },
    body,
  });
  const amt = data.amount !== null && data.amount !== undefined ? Number(data.amount) : null;
  return {
    id: data.id,
    orderNo: data.order_no || null,
    skuId: data.sku_id || skuId,
    quantity: Number(data.quantity || quantity),
    amount: Number.isFinite(amt) ? amt : null,
    currency: data.currency || "USDT",
    status: data.status || "pending",
    items: Array.isArray(data.items) ? data.items : [],
    raw: data,
  };
}

export async function getOrder(orderId) {
  const data = await call(`/orders/${encodeURIComponent(orderId)}`, { timeoutMs: 7000 });
  const amt = data.amount !== null && data.amount !== undefined ? Number(data.amount) : null;
  return {
    id: data.id || orderId,
    orderNo: data.order_no || null,
    status: data.status || "pending",
    amount: Number.isFinite(amt) ? amt : null,
    items: Array.isArray(data.items) ? data.items : [],
    raw: data,
  };
}

