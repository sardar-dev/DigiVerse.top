// Shotix (Canboso Buyer API v2.2) client. Server-side only.
// Base: https://canboso.com
// Auth: Bearer token (buyer key)
// Docs: OAS 3.0 — /api/v2/telegram-buyer/{products,balance,purchase,orders}
// Orders are NOT idempotent (no external_order_id field in the API).

import { cleanTitle } from "../cleanText";

const BASE = "https://canboso.com";
const KEY  = process.env.SHOTIX_API_KEY;

export const configured = () => Boolean(KEY);

async function call(path, { method = "GET", body, timeoutMs = 12000, mutating = false } = {}) {
  if (!configured()) throw new Error("SHOTIX_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(e.name === "AbortError" ? "Shotix request timed out" : e.message);
    err.ambiguous = mutating;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // Rate-limit: surface a clear message with retry hint
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") || "12";
    const err = new Error(`Shotix rate limit hit — retry after ${retryAfter}s`);
    err.status = 429;
    err.ambiguous = mutating;
    throw err;
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    const err = new Error(`Shotix returned a non-JSON response (${res.status})`);
    err.status = res.status;
    err.ambiguous = mutating;
    throw err;
  }
  if (!res.ok) {
    const msg = data.message || data.error?.message || data.error || `Shotix API error (${res.status})`;
    const err = new Error(String(msg).slice(0, 200));
    err.status = res.status;
    err.code = data.error?.code || data.code;
    err.body = data;
    err.ambiguous = mutating && res.status >= 500;
    throw err;
  }
  return data;
}

// ── normalise one product row ─────────────────────────────────
function normalize(p) {
  const id = p?.product_id ?? p?.id ?? null;
  const stock = (() => {
    for (const k of ["stock", "available", "available_stock", "quantity", "qty"]) {
      const v = p?.[k];
      if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
      if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.max(0, Number(v));
    }
    return undefined;
  })();
  const cost = Number(p?.price ?? p?.cost ?? p?.unit_price);
  return {
    supplierProductId: String(id),
    title:
      cleanTitle(String(p?.name ?? p?.title ?? p?.product_name ?? `Shotix #${id}`)) ||
      `Shotix #${id}`,
    description: p?.description ?? null,
    category: p?.category ?? null,
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

// ── public API ────────────────────────────────────────────────
export async function listProducts() {
  const data = await call("/api/v2/telegram-buyer/products");
  const list = pickList(data);
  const all = [];
  const seen = new Set();
  let skipped = 0;

  for (const p of list) {
    const id = p?.product_id ?? p?.id;
    if (id === null || id === undefined) { skipped++; continue; }
    const cost = Number(p?.price ?? p?.cost ?? p?.unit_price);
    if (!Number.isFinite(cost)) { skipped++; continue; }
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(normalize(p));
  }

  if (skipped > 0 || all.length === 0) {
    all.meta = {
      hint: `${all.length === 0 ? "No products found" : `${skipped} row(s) skipped`}. First row: ${JSON.stringify(list[0] ?? null).slice(0, 300)}`,
    };
  }
  return all;
}

export async function getProduct(id) {
  // No single-product endpoint in docs — scan list
  const data = await call("/api/v2/telegram-buyer/products");
  const list = pickList(data);
  const hit = list.find((p) => String(p?.product_id ?? p?.id) === String(id));
  if (hit) return normalize(hit);
  return {
    supplierProductId: String(id),
    title: `Shotix #${id}`,
    description: null, category: null,
    cost: 0, stock: 0, stockKnown: false,
    requiresEmail: false, delivery: "instant", warranty: null,
  };
}

export async function getBalance() {
  const data = await call("/api/v2/telegram-buyer/balance");
  const raw =
    data.balance ??
    data.wallet_balance ??
    data.wallet?.balance ??
    data.data?.balance ??
    data.amount ??
    data.usdt ??
    data.available ??
    data.available_balance;
  const val = raw === undefined && typeof data === "number" ? data : raw;
  if (val === undefined || val === null) {
    console.warn("[shotix] getBalance: unknown shape:", JSON.stringify(data).slice(0, 300));
  }
  return { balance: val === undefined || val === null ? null : Number(val), raw: data };
}

export async function health() {
  try {
    const res = await fetch(`${BASE}/api/v2/telegram-buyer/balance`, {
      headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// No external_order_id in PurchaseRequest — not idempotent.
// PurchaseRequest: { product_id, quantity }
export async function purchase({ productId, quantity }) {
  const data = await call("/api/v2/telegram-buyer/purchase", {
    method: "POST",
    mutating: true,
    timeoutMs: 25000,
    body: {
      product_id: String(productId),
      quantity: Number(quantity),
    },
  });

  // PurchaseResponse — try common delivery shapes
  let items = [];
  const raw = data.items ?? data.keys ?? data.delivery?.lines ?? data.data;
  if (Array.isArray(raw)) {
    items = raw.map((it) => {
      if (typeof it === "string" || typeof it === "number") return String(it);
      // object row — join known key fields
      if (it && typeof it === "object") {
        const v = it.key ?? it.value ?? it.item ?? it.code ?? it.serial;
        return v !== undefined ? String(v) : JSON.stringify(it);
      }
      return String(it);
    });
  } else if (typeof raw === "string" && raw.trim()) {
    items = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  if (items.length === 0) {
    const err = new Error("Shotix order placed but returned no delivery items");
    err.ambiguous = true;
    throw err;
  }

  return {
    supplierOrderId: String(data.order_id ?? data.orderId ?? data.id ?? ""),
    items,
    duplicate: false,
  };
}
