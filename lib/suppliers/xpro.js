// XPro Seller Partner API v1 client. Server-side only (holds a secret key).
// Docs: Bearer auth, JSON, `ok` flag on every response. Orders are
// idempotent on `externalOrderId`, so we send our own order id and can
// safely retry after a timeout without ever being charged twice.

import { cleanTitle } from "../cleanText";

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

const idOf = (p) => p?.id ?? p?.productId ?? p?.product_id ?? p?.pid ?? null;

// The stock figure can live under different names (or be nested) depending
// on the endpoint, so look in all the usual places. undefined = not found.
const STOCK_KEYS = ["stock", "available", "availableStock", "available_stock", "liveStock", "live_stock", "quantity", "qty", "inventory"];
function readStock(p) {
  if (!p || typeof p !== "object") return undefined;
  for (const k of STOCK_KEYS) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.max(0, Number(v));
    if (v && typeof v === "object") {
      const n = readStock(v);
      if (n !== undefined) return n;
    }
  }
  if (p.inStock === false) return 0;
  return undefined;
}

function normalize(p) {
  const id = idOf(p);
  const stock = readStock(p);
  return {
    supplierProductId: String(id),
    title: cleanTitle(String(p.name ?? p.title ?? p.productName ?? `XPro #${id}`)) || `XPro #${id}`,
    description: p.description ?? null,
    category: p.category ?? null,
    cost: Number(p.price ?? p.unitPrice ?? p.cost),
    stock: stock ?? 0,
    stockKnown: stock !== undefined,
    requiresEmail: false, // the order API has no email field
    delivery: "instant",
    warranty: null,
  };
}

// The docs show `products`, but be tolerant of a differently named list.
function pickList(data) {
  if (Array.isArray(data)) return data;
  for (const k of ["products", "items", "data", "results"]) {
    if (Array.isArray(data?.[k])) return data[k];
    if (Array.isArray(data?.[k]?.products)) return data[k].products;
  }
  return [];
}

export async function listProducts() {
  const all = [];
  const seen = new Set();
  const limit = 50; // the documented default page size
  let first = null;
  let skipped = 0;
  for (let page = 0; page < 60; page++) {
    const data = await call(`/catalog/products?limit=${limit}&offset=${page * limit}`);
    if (page === 0) first = data;
    const batch = pickList(data);
    let added = 0;
    for (const p of batch) {
      const pid = idOf(p);
      if (pid === null || pid === undefined || !Number.isFinite(Number(p.price ?? p.unitPrice ?? p.cost))) {
        skipped++;
        continue; // unusable row: never let it break the whole sync
      }
      const key = String(pid);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(normalize(p));
      added++;
    }
    if (batch.length < limit || added === 0) break; // last page
  }
  if (skipped > 0) {
    all.meta = { hint: `${skipped} XPro row(s) skipped (no id or price). First row: ${JSON.stringify(pickList(first)[0] ?? null).slice(0, 300)}` };
  }
  if (all.length === 0 && !all.meta) {
    // Say WHY it is empty so the admin can tell "no products" from "wrong shape".
    const keys = first && typeof first === "object" ? Object.keys(first).join(",") : typeof first;
    all.meta = { hint: `XPro returned no products (response keys: ${keys}; total: ${first?.total ?? "n/a"})` };
  }
  return all;
}

// Cheap diagnostic for the admin "Test connections" button.
export async function probeCatalog() {
  const data = await call("/catalog/products?limit=3&offset=0");
  const list = pickList(data);
  return {
    total: data?.total ?? null,
    sample: list.slice(0, 3).map((p) => ({ id: idOf(p), name: p.name ?? p.title, price: p.price, stock: p.stock })),
    firstRow: JSON.stringify(list[0] ?? null).slice(0, 400),
    keys: Object.keys(data || {}),
    single: await (async () => {
      const id = idOf(list[0]);
      if (id === null || id === undefined) return null;
      try {
        const d = await call(`/catalog/products/${encodeURIComponent(id)}`);
        const live = await getProduct(id);
        return { id, stock: live.stock, cost: live.cost, raw: JSON.stringify(d).slice(0, 300) };
      } catch (e) {
        return { id, error: e.message };
      }
    })(),
  };
}

// Live look at one product. If the single-product endpoint doesn't carry
// a usable stock/price (shape differs from the list), fall back to finding
// the product in the catalog list rather than wrongly reporting 0 stock.
export async function getProduct(id) {
  const data = await call(`/catalog/products/${encodeURIComponent(id)}`);
  const raw = data.product ?? data.item ?? (data.data && !Array.isArray(data.data) ? data.data : null) ?? data;
  const one = normalize(raw);
  if (one.stockKnown && Number.isFinite(one.cost)) return one;

  const limit = 50;
  for (let page = 0; page < 20; page++) {
    const list = pickList(await call(`/catalog/products?limit=${limit}&offset=${page * limit}`));
    const hit = list.find((p) => String(idOf(p)) === String(id));
    if (hit) return normalize(hit);
    if (list.length < limit) break;
  }
  return one;
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
    body: { productId: /^\d+$/.test(String(productId)) ? Number(productId) : productId, quantity, externalOrderId: String(orderId) },
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
