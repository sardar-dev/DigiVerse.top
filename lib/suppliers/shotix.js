// Shotix (Canboso Buyer API v2.2) client. Server-side only.
// Base: https://canboso.com
// Auth: Query parameter `?key=...` AND request body `{ key: ... }` for purchase.
// Docs: OAS 3.0 — /api/v2/telegram-buyer/{products,balance,purchase,orders}

import { cleanTitle } from "../cleanText";
import { supabaseAdmin } from "../supabaseAdmin";

const BASE = "https://canboso.com";
// Seed fallback buyer API key (also stored in custom_suppliers table)
const FALLBACK_KEY = "tgb_106435331588fe782a5dd6c6cc4a30c385e4b59321d07dd5";

let cachedKey = null;
let cachedKeyAt = 0;

export async function getKey() {
  if (process.env.SHOTIX_API_KEY) return process.env.SHOTIX_API_KEY;
  if (process.env.CANBOSO_API_KEY) return process.env.CANBOSO_API_KEY;

  if (cachedKey && Date.now() - cachedKeyAt < 60_000) {
    return cachedKey;
  }

  try {
    const { data } = await supabaseAdmin
      .from("custom_suppliers")
      .select("api_key")
      .or("id.ilike.%shotix%,id.ilike.%canboso%,label.ilike.%shotix%,label.ilike.%canboso%")
      .not("api_key", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.api_key) {
      cachedKey = data.api_key;
      cachedKeyAt = Date.now();
      return cachedKey;
    }
  } catch (e) {
    console.warn("[shotix] getKey db lookup failed:", e?.message);
  }

  return FALLBACK_KEY;
}

export const configured = () => true;

async function call(path, { method = "GET", body, timeoutMs = 12000, mutating = false, headers = {} } = {}) {
  const key = await getKey();
  if (!key) throw new Error("SHOTIX_API_KEY is not set");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}key=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
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
  const id = p?.productId ?? p?.product_id ?? p?.id ?? null;
  const stock = (() => {
    // Check nested availability object (Canboso format: { available: 1907, sold: 28303 })
    if (p?.availability && typeof p.availability === "object") {
      const av = p.availability.available ?? p.availability.stock ?? p.availability.qty;
      if (typeof av === "number" && Number.isFinite(av)) return Math.max(0, av);
      if (typeof av === "string" && av.trim() !== "" && Number.isFinite(Number(av))) return Math.max(0, Number(av));
    }
    for (const k of ["stock", "available", "available_stock", "quantity", "qty"]) {
      const v = p?.[k];
      if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
      if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.max(0, Number(v));
    }
    return undefined;
  })();

  const cost = (() => {
    // Check nested price object (Canboso format: { amount: 0.2, currency: "USD" })
    if (p?.price && typeof p.price === "object") {
      const amt = p.price.amount ?? p.price.value ?? p.price.price;
      if (Number.isFinite(Number(amt))) return Number(amt);
    }
    const c = Number(p?.price ?? p?.cost ?? p?.unit_price);
    return Number.isFinite(c) ? c : 0;
  })();

  return {
    supplierProductId: String(id),
    title:
      cleanTitle(String(p?.name ?? p?.title ?? p?.product_name ?? `Shotix #${id}`)) ||
      `Shotix #${id}`,
    description: p?.description ?? null,
    category: p?.category ?? null,
    cost,
    stock: stock ?? 0,
    stockKnown: stock !== undefined,
    requiresEmail: Boolean(p?.productType === "slot" || p?.requiresEmail || p?.requires_email),
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
    const id = p?.productId ?? p?.product_id ?? p?.id;
    if (id === null || id === undefined) { skipped++; continue; }
    const norm = normalize(p);
    if (!Number.isFinite(norm.cost)) { skipped++; continue; }
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(norm);
  }

  if (skipped > 0 || all.length === 0) {
    all.meta = {
      hint: `${all.length === 0 ? "No products found" : `${skipped} row(s) skipped`}. First row: ${JSON.stringify(list[0] ?? null).slice(0, 300)}`,
    };
  }
  return all;
}

export async function getProduct(id) {
  // No single-product endpoint in Canboso docs — scan list
  const data = await call("/api/v2/telegram-buyer/products", { timeoutMs: 8000 });
  const list = pickList(data);
  const hit = list.find((p) => String(p?.productId ?? p?.product_id ?? p?.id) === String(id));
  if (hit) return normalize(hit);
  return {
    supplierProductId: String(id),
    title: `Shotix #${id}`,
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
  const data = await call("/api/v2/telegram-buyer/balance");
  let val = data?.balanceUsd ?? data?.balance ?? data?.usdtBalance;
  if (val === undefined || val === null) {
    const KEYS = [
      "balance", "wallet_balance", "api_balance", "amount",
      "usdt", "usd", "available", "available_balance", "balanceUsd",
    ];
    for (const k of KEYS) {
      if (k in (data || {}) && data[k] !== null) { val = data[k]; break; }
    }
  }
  if (val === undefined || val === null) {
    for (const wrapper of ["wallet", "data", "result", "user"]) {
      if (data?.[wrapper] && typeof data[wrapper] === "object") {
        for (const k of ["balance", "wallet_balance", "api_balance", "amount", "usdt", "usd", "available", "balanceUsd"]) {
          if (k in data[wrapper] && data[wrapper][k] !== null) { val = data[wrapper][k]; break; }
        }
      }
      if (val !== undefined && val !== null) break;
    }
  }
  if (val === undefined && typeof data === "number") val = data;
  if (val === undefined || val === null) {
    console.warn("[shotix] getBalance: unknown shape:", JSON.stringify(data).slice(0, 300));
  }
  return { balance: val === undefined || val === null ? null : Number(val), raw: data };
}

export async function health() {
  try {
    const key = await getKey();
    const sep = "?";
    const res = await fetch(`${BASE}/api/v2/telegram-buyer/balance${sep}key=${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// PurchaseRequest: { key, product_id, quantity, customer_email?, customer_info? }
// Header: Idempotency-Key
export async function purchase({ productId, quantity, email, activationInfo, orderId, idempotencyKey }) {
  const key = await getKey();
  const idempKey = idempotencyKey || (orderId ? `order-${orderId}` : `purchase-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

  const body = {
    key,
    product_id: String(productId),
    quantity: Number(quantity),
  };
  if (email) body.customer_email = email;
  if (activationInfo) body.customer_info = activationInfo;

  // 8s timeout: fires before Vercel serverless request limits
  const data = await call("/api/v2/telegram-buyer/purchase", {
    method: "POST",
    mutating: true,
    timeoutMs: 8000,
    headers: {
      "Idempotency-Key": idempKey,
    },
    body,
  });

  // PurchaseResponse — Canboso delivers under delivery.accounts or delivery.lines or delivery.text
  let items = [];
  if (Array.isArray(data.delivery?.accounts)) {
    items = data.delivery.accounts.map((acc) => {
      if (!acc || typeof acc !== "object") return String(acc);
      const user = acc.user || acc.username || acc.email || "";
      const pass = acc.password || acc.pass || "";
      const extra = acc.verifyEmail ? ` (Verify: ${acc.verifyEmail})` : "";
      if (user && pass) return `${user}:${pass}${extra}`;
      if (user) return `${user}${extra}`;
      return JSON.stringify(acc);
    });
  } else if (data.delivery?.text && typeof data.delivery.text === "string") {
    items = data.delivery.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  if (items.length === 0) {
    const raw = data.items ?? data.keys ?? data.delivery?.lines ?? data.data;
    if (Array.isArray(raw)) {
      items = raw.map((it) => {
        if (typeof it === "string" || typeof it === "number") return String(it);
        if (it && typeof it === "object") {
          const v = it.key ?? it.value ?? it.item ?? it.code ?? it.serial;
          return v !== undefined ? String(v) : JSON.stringify(it);
        }
        return String(it);
      });
    } else if (typeof raw === "string" && raw.trim()) {
      items = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
  }

  if (items.length === 0) {
    if (data.order?.orderCode || data.orderCode || data.order_id) {
      items = [`Order placed: ${data.order?.orderCode || data.order_id}. Please contact support with this order code.`];
    } else {
      const err = new Error("Shotix order placed but returned no delivery items");
      err.ambiguous = true;
      throw err;
    }
  }

  return {
    supplierOrderId: String(data.order?.orderCode ?? data.order_id ?? data.orderId ?? data.id ?? ""),
    items,
    duplicate: false,
  };
}
