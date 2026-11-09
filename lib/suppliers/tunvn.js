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
    err.code = /insufficient|not enough|low balance|không đủ/i.test(String(msg)) ? "INSUFFICIENT_BALANCE" : undefined;
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

// Try to extract delivery lines from any known TunVN response shape.
// TunVN sometimes wraps in .order, .result, .data, .order_detail, etc.
function extractItems(root) {
  // All candidate objects to search
  const candidates = [root];
  if (root && typeof root === "object") {
    for (const k of ["order", "result", "order_detail", "data", "detail"]) {
      if (root[k] && typeof root[k] === "object") candidates.push(root[k]);
    }
  }
  for (const o of candidates) {
    const lines = toLines(
      o?.items ?? o?.accounts ?? o?.keys ?? o?.delivery?.lines ??
      o?.delivery?.items ?? o?.delivery?.accounts ?? o?.account_list ??
      o?.content ?? o?.data ?? o?.list
    );
    if (lines.length > 0) return lines;
  }
  return [];
}
const itemsOf = extractItems;

// POST /api/buy { product_id, quantity, currency }. Not idempotent: never retried.
export async function purchase({ productId, quantity }) {
  const pid = Number.isFinite(Number(productId)) ? Number(productId) : String(productId);

  const data = await call("/api/buy", {
    method: "POST",
    mutating: true,
    timeoutMs: 7000,
    body: { product_id: pid, quantity: Number(quantity), currency: "usdt" },
  });

  // Detect explicit failure if returned with 2xx
  if (data?.success === false || data?.status === "failed" || data?.status === "error") {
    const msg = detailOf(data, "TunVN buy returned success:false");
    const hasOrderId = !!(data?.order?.order_group ?? data?.order_id ?? data?.order?.id ?? data?.id);
    const err = new Error(String(msg).slice(0, 200));
    err.ambiguous = hasOrderId; // only ambiguous if order actually existed upstream
    throw err;
  }

  const order = data?.order && typeof data.order === "object" ? data.order : data;
  const orderId =
    order?.order_group ?? order?.id ?? order?.order_id ??
    data?.order_id ?? data?.id ?? data?.result?.id ?? data?.result?.order_id ?? "";
  let items = itemsOf(data);
  let buffUrl = order?.buff_url || data?.buff_url || data?.result?.buff_url || "";

  // Some responses only carry the order; the delivered items are on the order record.
  if (items.length === 0 && orderId !== "") {
    try {
      const full = await call(`/api/orders/${encodeURIComponent(orderId)}`, { timeoutMs: 2500 });
      items = itemsOf(full);
      buffUrl = buffUrl || full?.buff_url || full?.order?.buff_url || "";
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

// ── Buff Token (Muse AI invite-code top-up) ───────────────────
// POST /api/buff/check   { orders_text: "CODE QTY" }  → price/validate, no charge
// POST /api/buff/order   { orders_text }              → charges wallet, returns batch_id
// GET  /api/buff/status?batch_id=…                    → progress (≈1–2 min)
// `orders_text` is one "CODE QTY" per line, so callers MUST pass a validated
// code (no whitespace/newlines) or a customer could smuggle extra orders.
// Response shapes beyond batch_id aren't fully documented, so parsing below is
// deliberately tolerant and falls back to "ask a human" instead of guessing.

// First finite number found under any of `keys` (breadth-first, shallow).
function findNumber(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) {
    const n = findNumber(v, keys, depth + 1);
    if (n !== null) return n;
  }
  return null;
}
function findString(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return "";
  for (const k of keys) {
    const v = obj[k];
    if ((typeof v === "string" && v) || typeof v === "number") return String(v);
  }
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) {
    const s = findString(v, keys, depth + 1);
    if (s) return s;
  }
  return "";
}
function collectStatuses(obj, out = [], depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return out;
  for (const [k, v] of Object.entries(obj)) {
    if ((k === "status" || k === "state") && typeof v === "string") out.push(v.toLowerCase());
    else if (v && typeof v === "object") collectStatuses(v, out, depth + 1);
  }
  return out;
}

const USDT_KEYS = ["total_usdt", "total_price_usdt", "sell_price_usdt", "price_usdt", "cost_usdt", "usdt", "total_usd", "price_usd"];

// Returns the price in USDT (null if the response doesn't say). Throws if
// TunVN rejects the code/quantity. Never charges.
export async function buffCheck(code, qty) {
  const data = await call("/api/buff/check", {
    method: "POST",
    timeoutMs: 3500,
    body: { orders_text: `${code} ${qty}` },
  });
  if (data?.success === false || data?.valid === false || data?.ok === false) {
    throw new Error(String(detailOf(data, "TunVN rejected the invite code")).slice(0, 200));
  }
  if (data?.fundable === false) {
    throw new Error("TunVN Buff service is temporarily unavailable (fundable: false)");
  }
  if (Array.isArray(data?.orders_breakdown)) {
    const invalid = data.orders_breakdown.find((o) => o.valid === false);
    if (invalid) {
      throw new Error(invalid.error || invalid.msg || `Invalid invite code: ${code}`);
    }
  }
  const price = findNumber(data, USDT_KEYS);
  if (price === null) console.warn("[tunvn] buff/check: price not found in:", JSON.stringify(data).slice(0, 300));
  return price;
}

// Places the order (charges the wallet). Not idempotent: never retried.
export async function buffOrder(code, qty) {
  const data = await call("/api/buff/order", {
    method: "POST",
    mutating: true,
    timeoutMs: 4000,
    body: { orders_text: `${code} ${qty}`, currency: "usdt" },
  });
  if (data?.success === false || data?.ok === false) {
    throw new Error(String(detailOf(data, "TunVN rejected the buff order")).slice(0, 200));
  }
  const batchId = findString(data, ["batch_id", "batchId"]);
  if (!batchId) {
    const err = new Error(`TunVN buff order placed but no batch_id returned: ${JSON.stringify(data).slice(0, 200)}`);
    err.ambiguous = true;
    throw err;
  }
  return { batchId, price: findNumber(data, USDT_KEYS), raw: data };
}

// → { state: "done" | "failed" | "pending", detail }
export async function buffStatus(batchId) {
  const data = await call(`/api/buff/status?batch_id=${encodeURIComponent(batchId)}`, { timeoutMs: 4000 });
  const statuses = collectStatuses(data);
  if (statuses.length === 0) console.warn("[tunvn] buff/status: no status in:", JSON.stringify(data).slice(0, 300));
  if (statuses.some((s) => /fail|error|cancel|refund|reject/.test(s))) {
    return { state: "failed", detail: statuses.join(",") };
  }
  const done = (s) => /^(done|complete|completed|success|successful|finished|credited|delivered)$/.test(s);
  if (statuses.length > 0 && statuses.every(done)) return { state: "done", detail: statuses.join(",") };
  if (data?.is_done === true) return { state: "done", detail: "is_done: true" };
  return { state: "pending", detail: statuses.join(",") };
}
