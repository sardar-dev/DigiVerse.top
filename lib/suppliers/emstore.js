// EM Store Reseller API client. Server-side only (holds a secret key).
// Docs: Bearer auth, JSON.
// Base: https://ssondigitalworks.online/api/reseller
// Orders are idempotent on `external_order_id`, so we can safely retry
// after a timeout without being charged twice.

import { cleanTitle } from "../cleanText";

const BASE = "https://ssondigitalworks.online/api/reseller";
const KEY = process.env.EMSTORE_API_KEY;

export const configured = () => Boolean(KEY);

async function call(action, { method = "GET", body, timeoutMs = 12000, mutating = false } = {}) {
  if (!configured()) throw new Error("EMSTORE_API_KEY is not set");

  const url = `${BASE}?action=${action}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(e.name === "AbortError" ? "EM Store request timed out" : e.message);
    err.ambiguous = mutating;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    const err = new Error(`EM Store returned a non-JSON response (${res.status})`);
    err.status = res.status;
    err.ambiguous = mutating;
    throw err;
  }
  if (!res.ok || data.success === false || data.ok === false) {
    const msg =
      data.error?.message || data.error || data.message || `EM Store API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.error?.code || data.code;
    err.body = data;
    err.ambiguous = mutating && res.status >= 500;
    throw err;
  }
  return data;
}

const idOf = (p) =>
  p?.product_id ?? p?.id ?? p?.productId ?? p?.pid ?? null;

const STOCK_KEYS = [
  "stock", "available", "availableStock", "available_stock",
  "liveStock", "live_stock", "quantity", "qty", "inventory",
];
function readStock(p) {
  if (!p || typeof p !== "object") return undefined;
  for (const k of STOCK_KEYS) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
      return Math.max(0, Number(v));
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
  const cost =
    Number(p.price ?? p.cost ?? p.unitPrice ?? p.unit_price ?? p.wholesale_price);
  return {
    supplierProductId: String(id),
    title:
      cleanTitle(String(p.name ?? p.title ?? p.product_name ?? `EM Store #${id}`)) ||
      `EM Store #${id}`,
    description: p.description ?? null,
    category: p.category ?? null,
    cost: Number.isFinite(cost) ? cost : 0,
    stock: stock ?? 0,
    stockKnown: stock !== undefined,
    requiresEmail: false,
    delivery: "instant",
    warranty: null,
  };
}

function pickList(data) {
  if (Array.isArray(data)) return data;
  for (const k of ["products", "items", "data", "results"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

export async function listProducts() {
  const data = await call("products");
  const list = pickList(data);
  const all = [];
  const seen = new Set();
  let skipped = 0;

  for (const p of list) {
    const pid = idOf(p);
    if (pid === null || pid === undefined) { skipped++; continue; }
    const cost = Number(p.price ?? p.cost ?? p.unitPrice ?? p.unit_price ?? p.wholesale_price);
    if (!Number.isFinite(cost)) { skipped++; continue; }
    const key = String(pid);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(normalize(p));
  }

  if (skipped > 0) {
    all.meta = {
      hint: `${skipped} EM Store row(s) skipped (no id or price). First row: ${JSON.stringify(list[0] ?? null).slice(0, 300)}`,
    };
  }
  if (all.length === 0 && !all.meta) {
    const keys = data && typeof data === "object" ? Object.keys(data).join(",") : typeof data;
    all.meta = {
      hint: `EM Store returned no products (response keys: ${keys})`,
    };
  }
  return all;
}

export async function getProduct(id) {
  // EM Store has no single-product endpoint in the docs — scan list
  const data = await call("products", { timeoutMs: 8000 });
  const list = pickList(data);
  const hit = list.find((p) => String(idOf(p)) === String(id));
  if (hit) return normalize(hit);

  // Return a stub so the caller can at least see the id; stock = 0
  return {
    supplierProductId: String(id),
    title: `EM Store #${id}`,
    description: null,
    category: null,
    cost: 0,
    stock: 0,
    stockKnown: false,
    requiresEmail: false,
    delivery: "instant",
    warranty: null,
  };
}

export async function getBalance() {
  const data = await call("balance");
  // Walk every known key — use `in` not `??` so 0 is not skipped
  const KEYS = [
    "balance", "wallet_balance", "api_balance", "amount",
    "usdt", "usd", "available", "available_balance",
  ];
  let val = undefined;
  for (const k of KEYS) {
    if (k in (data || {}) && data[k] !== null) { val = data[k]; break; }
  }
  // Nested: data.wallet.balance, data.data.balance, etc.
  if (val === undefined) {
    for (const wrapper of ["wallet", "data", "result", "user"]) {
      if (data?.[wrapper] && typeof data[wrapper] === "object") {
        for (const k of KEYS) {
          if (k in data[wrapper] && data[wrapper][k] !== null) { val = data[wrapper][k]; break; }
        }
      }
      if (val !== undefined) break;
    }
  }
  // Top-level plain number
  if (val === undefined && typeof data === "number") val = data;
  if (val === undefined) {
    console.warn("[emstore] getBalance: unknown shape:", JSON.stringify(data).slice(0, 300));
  }
  return { balance: val === undefined ? null : Number(val), raw: data };
}

export async function health() {
  try {
    const res = await fetch(`${BASE}?action=balance`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// `orderId` is our order UUID → external_order_id (idempotency key).
export async function purchase({ productId, quantity, orderId }) {
  // Keep under Vercel free-plan's 10 s function limit so the timeout
  // fires *inside* our process (catch runs → needs_reconciliation) rather
  // than Vercel killing the process mid-purchase (catch never runs →
  // order stuck in "fulfilling", balance deducted, no items delivered).
  const data = await call("order", {
    method: "POST",
    mutating: true,
    timeoutMs: 8000,
    body: {
      product_id: String(productId),
      quantity: Number(quantity),
      external_order_id: String(orderId),
    },
  });

  // Parse delivered items — API may return an array or newline-separated string
  let items = [];
  const raw = data.items ?? data.delivery?.lines ?? data.keys ?? data.data;
  if (Array.isArray(raw)) {
    items = raw.map(String);
  } else if (typeof raw === "string" && raw.trim()) {
    items = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  if (items.length === 0) {
    const err = new Error("EM Store order placed but returned no delivery items");
    err.ambiguous = true;
    throw err;
  }

  return {
    supplierOrderId: String(data.order_id ?? data.orderId ?? data.id ?? ""),
    items,
    duplicate: Boolean(data.duplicate),
  };
}
