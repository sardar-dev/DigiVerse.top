// TunVN reseller API client. Server-side only (the key moves money).
// Base: https://tunvnmmo.duckdns.org   Docs: /api/docs
// Auth: header `X-API-Key: <key>` (NOT a Bearer token). Env: TUNVN_API_KEY
//
// Things that shape this file:
//  - /api/buy has no idempotency key → purchases are never retried here, and
//    the supplier is registered with idempotent:false so fulfillOrder won't
//    retry either. A timeout/5xx on buy is "ambiguous" (needs a human look).
//  - Limits: 30 req / 60 s, and 5 wrong keys = 15 min IP block. After one
//    401/403 we stop calling for 15 min instead of hammering a bad key.
//  - Account products return `items` (e.g. "mail | pass"). Game items return a
//    `buff_url` instead and need a manual step, so those are NOT auto-delivered.
//  - Vercel free = 10 s per request, so timeouts here are short.

import { cleanTitle } from "../cleanText";

const BASE = "https://tunvnmmo.duckdns.org";
const AUTH_COOLDOWN_MS = 15 * 60 * 1000;
let authFailedAt = 0;

const key = () => process.env.TUNVN_API_KEY;
export const configured = () => Boolean(key());

function detailOf(data, fallback) {
  const d = data?.detail ?? data?.message ?? data?.error;
  if (typeof d === "string" && d) return d;
  if (Array.isArray(d) && d.length) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ");
  if (d && typeof d === "object") return d.message || JSON.stringify(d);
  return fallback;
}

async function call(path, { method = "GET", body, timeoutMs = 8000, mutating = false } = {}) {
  if (!configured()) throw new Error("TUNVN_API_KEY is not set");
  if (authFailedAt && Date.now() - authFailedAt < AUTH_COOLDOWN_MS) {
    throw new Error("TunVN rejected the API key — check TUNVN_API_KEY (calls paused to avoid an IP block)");
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "X-API-Key": key(),
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(e.name === "TimeoutError" || e.name === "AbortError" ? "TunVN request timed out" : e.message);
    err.ambiguous = mutating;
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    authFailedAt = Date.now();
    const err = new Error("TunVN rejected the API key (check TUNVN_API_KEY)");
    err.status = res.status;
    throw err; // nothing was bought, so not ambiguous
  }
  if (res.status === 429) {
    const err = new Error("TunVN rate limit hit (30 requests / 60 s) — try again shortly");
    err.status = 429;
    err.ambiguous = false; // rejected before processing
    throw err;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = detailOf(data, `TunVN API error (${res.status})`);
    const err = new Error(String(msg).slice(0, 200));
    err.status = res.status;
    err.code = /insufficient|not enough|low balance/i.test(String(msg)) ? "INSUFFICIENT_BALANCE" : undefined;
    err.ambiguous = mutating && res.status >= 500;
    throw err;
  }
  if (data === null) {
    const err = new Error(`TunVN returned a non-JSON response (${res.status})`);
    err.status = res.status;
    err.ambiguous = mutating;
    throw err;
  }
  return data;
}

// ── products ──────────────────────────────────────────────────
function pickList(data) {
  if (Array.isArray(data)) return data;
  for (const k of ["products", "items", "data", "results"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

function normalize(p) {
  const id = p?.id ?? p?.product_id ?? null;
  const stockRaw = p?.stock ?? p?.available ?? p?.quantity;
  const stockNum = Number(stockRaw);
  const stockKnown = stockRaw !== undefined && stockRaw !== null && stockRaw !== "" && Number.isFinite(stockNum);
  const cost = Number(p?.price_usdt ?? p?.price_usd ?? p?.price);
  return {
    supplierProductId: String(id),
    title: cleanTitle(String(p?.name ?? p?.title ?? `TunVN #${id}`)) || `TunVN #${id}`,
    description: typeof p?.description === "string" ? p.description : null,
    category: p?.category ?? null,
    cost: Number.isFinite(cost) ? cost : 0,
    stock: stockKnown ? Math.max(0, stockNum) : 0,
    stockKnown,
    requiresEmail: false,
    delivery: "instant",
    warranty: null,
  };
}

export async function listProducts() {
  const data = await call("/api/products");
  const list = pickList(data);
  const all = [];
  const seen = new Set();
  let skipped = 0;
  for (const p of list) {
    const id = p?.id ?? p?.product_id;
    const cost = Number(p?.price_usdt ?? p?.price_usd ?? p?.price);
    if (id === null || id === undefined || !Number.isFinite(cost)) {
      skipped++;
      continue;
    }
    const k = String(id);
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(normalize(p));
  }
  if (skipped > 0 || all.length === 0) {
    all.meta = {
      hint: `${all.length === 0 ? "No products found" : `${skipped} row(s) skipped`}. First row: ${JSON.stringify(list[0] ?? null).slice(0, 300)}`,
    };
  }
  return all;
}

// No single-product endpoint in the docs — the list is the stock check.
export async function getProduct(id) {
  const data = await call("/api/products", { timeoutMs: 6000 });
  const hit = pickList(data).find((p) => String(p?.id ?? p?.product_id) === String(id));
  if (hit) return normalize(hit);
  return {
    supplierProductId: String(id),
    title: `TunVN #${id}`,
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

// ── balance / health ──────────────────────────────────────────
// Live shape: { success, user_id, username, balance_vnd, balance_usdt, usdt_vnd }
export async function getBalance() {
  const data = await call("/api/balance");
  const KEYS = ["balance_usdt", "balance_usd", "usdt", "balance"];
  let val;
  for (const k of KEYS) {
    if (k in (data || {}) && data[k] !== null && Number.isFinite(Number(data[k]))) {
      val = Number(data[k]);
      break;
    }
  }
  // Dashboards show USD. Fall back to VND ÷ rate only if USDT is missing.
  if (val === undefined && Number(data?.balance_vnd) > 0 && Number(data?.usdt_vnd) > 0) {
    val = Number(data.balance_vnd) / Number(data.usdt_vnd);
  }
  if (val === undefined) console.warn("[tunvn] getBalance: unknown shape:", JSON.stringify(data).slice(0, 300));
  return { balance: val === undefined ? null : val, raw: data };
}

export async function health() {
  if (!configured()) return { ok: false, status: 0 };
  try {
    const res = await fetch(`${BASE}/api/balance`, {
      headers: { "X-API-Key": key(), Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ── purchase ──────────────────────────────────────────────────
function toLines(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((it) => {
        if (typeof it === "string" || typeof it === "number") return String(it);
        if (it && typeof it === "object") {
          const v = it.account ?? it.key ?? it.value ?? it.item ?? it.content ?? it.data;
          return v !== undefined ? String(v) : JSON.stringify(it);
        }
        return "";
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const itemsOf = (o) => toLines(o?.items ?? o?.accounts ?? o?.keys ?? o?.delivery?.lines ?? o?.data);

// POST /api/buy { product_id, quantity }. Not idempotent: never retried.
export async function purchase({ productId, quantity }) {
  const pid = Number.isFinite(Number(productId)) ? Number(productId) : String(productId);
  const data = await call("/api/buy", {
    method: "POST",
    mutating: true,
    timeoutMs: 6000, // + up to 2 s for the follow-up below, all inside Vercel's 10 s
    body: { product_id: pid, quantity: Number(quantity) },
  });

  const order = data?.order && typeof data.order === "object" ? data.order : data;
  const orderId = order?.id ?? order?.order_id ?? data?.order_id ?? "";
  let items = itemsOf(order);
  let buffUrl = order?.buff_url || data?.buff_url || "";

  // Some responses only carry the order; the delivered items are on the order record.
  if (items.length === 0 && orderId !== "") {
    try {
      const full = await call(`/api/orders/${encodeURIComponent(orderId)}`, { timeoutMs: 2000 });
      const rec = full?.order && typeof full.order === "object" ? full.order : full;
      items = itemsOf(rec);
      buffUrl = buffUrl || rec?.buff_url || "";
    } catch {
      /* fall through to the error below with the order id attached */
    }
  }

  if (items.length === 0) {
    const err = new Error(
      buffUrl
        ? `TunVN order ${orderId} placed but needs a manual buff step: ${buffUrl}`
        : `TunVN order ${orderId || "(id unknown)"} placed but returned no delivery items — check it in TunVN`
    );
    err.ambiguous = true; // money was spent upstream; never refund or retry automatically
    throw err;
  }

  return { supplierOrderId: String(orderId), items, duplicate: false };
}
