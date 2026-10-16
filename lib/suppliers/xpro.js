// XPro Seller Partner API v1 client. Server-side only (holds a secret key).
// Docs: Bearer auth, JSON, `ok` flag on every response. Orders are
// idempotent on `externalOrderId`, so we send our own order id and can
// safely retry after a timeout without ever being charged twice.

const BASE = (process.env.XPRO_API_BASE || "").replace(/\/+$/, "");
const KEY = process.env.XPRO_API_KEY;

export const configured = () => Boolean(BASE && KEY);

async function call(path, { method = "GET", body, timeoutMs = 12000, mutating = false } = {}) {
  if (!configured()) throw new Error("XPRO_API_BASE or XPRO_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(e.name === "AbortError" ? "XPro request timed out" : e.message);
    err.ambiguous = mutating; // we can't know if a purchase went through
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    const err = new Error(`XPro returned a non-JSON response (${res.status})`);
    err.status = res.status;
    err.ambiguous = mutating;
    throw err;
  }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error?.message || data.error?.code || `XPro API error (${res.status})`);
    err.status = res.status;
    err.code = data.error?.code;
    err.body = data;
    // 5xx on a purchase: outcome unknown. 4xx with a code = clean "no".
    err.ambiguous = mutating && res.status >= 500;
    throw err;
  }
  return data;
}

function normalize(p) {
  return {
    supplierProductId: String(p.id),
    title: String(p.name ?? p.title ?? `XPro #${p.id}`),
    description: p.description ?? null,
    category: p.category ?? null,
    cost: Number(p.price),
    stock: Math.max(0, Number(p.stock) || 0),
    requiresEmail: false, // the order API has no email field
    delivery: "instant",
    warranty: null,
  };
}

export async function listProducts() {
  const all = [];
  const seen = new Set();
  const limit = 100;
  for (let page = 0; page < 40; page++) {
    const data = await call(`/catalog/products?limit=${limit}&offset=${page * limit}`);
    const batch = data.products || [];
    let added = 0;
    for (const p of batch) {
      const key = String(p.id);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(normalize(p));
      added++;
    }
    if (batch.length === 0 || added === 0) break; // end of catalog
  }
  return all;
}

export async function getProduct(id) {
  const data = await call(`/catalog/products/${encodeURIComponent(id)}`);
  return normalize(data.product || data);
}

export async function getBalance() {
  const data = await call("/balance");
  const raw = data.balance ?? data.wallet?.balance ?? data.data?.balance;
  return { balance: raw === undefined ? null : Number(raw), raw: data };
}

export async function health() {
  const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(6000) });
  return { ok: res.ok, status: res.status };
}

// `orderId` is OUR order uuid -> externalOrderId (idempotency key).
export async function purchase({ productId, quantity, orderId }) {
  const data = await call("/orders", {
    method: "POST",
    mutating: true,
    timeoutMs: 20000,
    body: { productId: Number(productId), quantity, externalOrderId: String(orderId) },
  });
  const status = String(data.order?.status || "").toUpperCase();
  const lines = data.delivery?.lines;
  if (status && status !== "COMPLETED") {
    const err = new Error(`XPro order not completed (${status})`);
    err.ambiguous = true;
    throw err;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    const err = new Error("XPro order completed but returned no delivery lines");
    err.ambiguous = true;
    throw err;
  }
  return {
    supplierOrderId: String(data.order?.orderId ?? ""),
    items: lines.map(String),
    duplicate: Boolean(data.duplicate),
  };
}
