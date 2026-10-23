// Generic supplier driven by a config saved from the admin panel
// (table custom_suppliers). No code per supplier: the config says which
// URL lists products, where the id/title/price/stock live in the JSON,
// how to authenticate and how to place an order.
import { cleanTitle } from "../cleanText";

// ── helpers ────────────────────────────────────────────────────
export function getPath(obj, path) {
  if (path === undefined || path === null || path === "") return obj;
  let cur = obj;
  for (const k of String(path).split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}

// Admin-only feature, but still: only public https hosts.
export function assertPublicHttps(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL");
  }
  if (u.protocol !== "https:") throw new Error("The URL must start with https://");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.startsWith("[") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  ) {
    throw new Error("Private or local addresses are not allowed");
  }
  return u;
}

const num = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return v.trim() === "" ? NaN : n;
  }
  return NaN;
};

// Fills {{product_id}}, {{quantity}}, {{order_id}}, {{email}} in a body
// template. "{{quantity|number}}" alone in a value becomes a real number.
function fill(tpl, vars) {
  if (typeof tpl === "string") {
    const m = tpl.match(/^\{\{(\w+)(\|number)?\}\}$/);
    if (m) return m[2] ? Number(vars[m[1]]) : vars[m[1]] ?? "";
    return tpl.replace(/\{\{(\w+)(?:\|number)?\}\}/g, (_, k) => String(vars[k] ?? ""));
  }
  if (Array.isArray(tpl)) return tpl.map((v) => fill(v, vars));
  if (tpl && typeof tpl === "object") return Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, fill(v, vars)]));
  return tpl;
}

const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pathStr = (v) => str(v, 120).replace(/[^\w.\-\[\]]/g, "");
const urlPath = (v) => {
  const s = str(v, 300);
  return s ? (s.startsWith("/") ? s : `/${s}`) : "";
};
const cleanMap = (m = {}) => ({
  id: pathStr(m.id) || "id",
  title: pathStr(m.title) || "name",
  price: pathStr(m.price) || "price",
  stock: pathStr(m.stock),
  description: pathStr(m.description),
  category: pathStr(m.category),
});
const cleanQuery = (q) =>
  q && typeof q === "object" && !Array.isArray(q)
    ? Object.fromEntries(Object.entries(q).slice(0, 12).map(([k, v]) => [str(k, 40), str(String(v), 100)]))
    : {};

// Keeps only known keys with sane types/limits, whatever the AI (or a
// hand edit) produced. Also used to show the admin the cleaned result.
export function normalizeConfig(raw = {}) {
  const c = raw && typeof raw === "object" ? raw : {};
  const l = c.list || {};
  const pg = l.pagination || {};
  const out = {
    supports_email: Boolean(c.supports_email),
    idempotent_orders: Boolean(c.idempotent_orders),
    stock_default: Number.isFinite(Number(c.stock_default)) && c.stock_default !== "" && c.stock_default !== null ? Math.max(0, Math.floor(Number(c.stock_default))) : null,
    list: {
      method: "GET",
      path: urlPath(l.path) || "/products",
      query: cleanQuery(l.query),
      items_path: pathStr(l.items_path),
      pagination: {
        type: ["none", "offset", "page"].includes(pg.type) ? pg.type : "none",
        size: Math.min(500, Math.max(1, Math.floor(Number(pg.size)) || 50)),
        limit_param: pathStr(pg.limit_param) || "limit",
        offset_param: pathStr(pg.offset_param) || "offset",
        page_param: pathStr(pg.page_param) || "page",
        page_start: Number(pg.page_start) === 0 ? 0 : 1,
        max_pages: Math.min(100, Math.max(1, Math.floor(Number(pg.max_pages)) || 40)),
      },
      map: cleanMap(l.map),
    },
  };
  if (c.product && c.product.path) {
    out.product = { path: urlPath(c.product.path), items_path: pathStr(c.product.items_path), map: cleanMap(c.product.map || l.map) };
  }
  if (c.balance && c.balance.path) {
    out.balance = { path: urlPath(c.balance.path), value_path: pathStr(c.balance.value_path) };
  }
  if (c.purchase && c.purchase.path) {
    const p = c.purchase;
    out.purchase = {
      method: ["POST", "PUT", "GET"].includes(String(p.method).toUpperCase()) ? String(p.method).toUpperCase() : "POST",
      path: urlPath(p.path),
      body: p.body && typeof p.body === "object" ? p.body : {},
      items_path: pathStr(p.items_path),
      items_field: pathStr(p.items_field),
      order_id_path: pathStr(p.order_id_path),
      success_path: pathStr(p.success_path),
      success_value: str(p.success_value, 100),
    };
  }
  return out;
}

// ── HTTP ───────────────────────────────────────────────────────
function authParts(row) {
  const headers = { Accept: "application/json" };
  const query = {};
  const key = row.api_key || "";
  switch (row.auth_type) {
    case "bearer":
      headers.Authorization = `Bearer ${key}`;
      break;
    case "header":
      headers[row.auth_header || "X-API-Key"] = `${row.auth_prefix || ""}${key}`;
      break;
    case "basic":
      headers.Authorization = `Basic ${Buffer.from(key).toString("base64")}`;
      break;
    case "query":
      query[row.auth_header || "api_key"] = key;
      break;
    default:
  }
  for (const [k, v] of Object.entries(row.extra_headers || {})) {
    if (typeof v === "string" && /^[\w-]{1,60}$/.test(k)) headers[k] = v;
  }
  return { headers, query };
}

async function call(row, { method = "GET", path, query = {}, body, timeoutMs = 15000, mutating = false }) {
  const base = assertPublicHttps(row.base_url).toString().replace(/\/+$/, "");
  const a = authParts(row);
  const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
  for (const [k, v] of Object.entries({ ...query, ...a.query })) url.searchParams.set(k, String(v));

  const hasBody = body && method !== "GET";
  let res;
  try {
    res = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { ...a.headers, ...(hasBody ? { "Content-Type": "application/json" } : {}) },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(e.name === "TimeoutError" || e.name === "AbortError" ? `${row.label} request timed out` : e.message);
    err.ambiguous = mutating; // can't know whether a purchase went through
    throw err;
  }

  const text = (await res.text().catch(() => "")).slice(0, 6_000_000);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (res.status >= 300 && res.status < 400) {
    throw Object.assign(new Error(`${row.label} redirected (${res.status}); check the base URL`), { status: res.status });
  }
  if (!res.ok) {
    const msg =
      (data && (data.error?.message || data.message || (typeof data.error === "string" ? data.error : "") || data.detail)) ||
      text.slice(0, 160);
    const err = new Error(`${row.label} API error (${res.status}): ${String(msg).slice(0, 200)}`);
    err.status = res.status;
    err.code = /insufficient|not enough|low balance/i.test(String(msg)) ? "INSUFFICIENT_BALANCE" : data?.error?.code || data?.code;
    err.ambiguous = mutating && res.status >= 500;
    throw err;
  }
  if (data === null) {
    const err = new Error(`${row.label} did not return JSON (${res.status}): ${text.slice(0, 120)}`);
    err.ambiguous = mutating;
    throw err;
  }
  return data;
}

// ── product shape ──────────────────────────────────────────────
function normalizeItem(raw, map, cfg) {
  const id = getPath(raw, map.id);
  const price = num(getPath(raw, map.price));
  if (id === undefined || id === null || id === "" || !Number.isFinite(price)) return null;
  let stock;
  if (map.stock) {
    const v = getPath(raw, map.stock);
    if (typeof v === "boolean") stock = v ? cfg.stock_default ?? 0 : 0;
    else if (Number.isFinite(num(v))) stock = Math.max(0, Math.floor(num(v)));
  }
  const stockKnown = stock !== undefined;
  if (!stockKnown) stock = cfg.stock_default ?? 0;
  const title = cleanTitle(String(getPath(raw, map.title) ?? `#${id}`)) || `#${id}`;
  const desc = map.description ? getPath(raw, map.description) : null;
  const cat = map.category ? getPath(raw, map.category) : null;
  return {
    supplierProductId: String(id),
    title,
    description: typeof desc === "string" ? desc : null,
    category: typeof cat === "string" ? cat : null,
    cost: price,
    stock,
    stockKnown,
    requiresEmail: false,
    delivery: "instant",
    warranty: null,
  };
}

const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);

export function makeCustomApi(row) {
  const cfg = normalizeConfig(row.config);
  const label = row.label;
  const r = { ...row, label };

  async function listPages(maxPagesOverride) {
    const l = cfg.list;
    const pg = l.pagination;
    const maxPages = maxPagesOverride || pg.max_pages;
    const all = [];
    const seen = new Set();
    let skipped = 0;
    let firstRaw = null;
    for (let page = 0; page < maxPages; page++) {
      const query = { ...l.query };
      if (pg.type === "offset") {
        query[pg.limit_param] = pg.size;
        query[pg.offset_param] = page * pg.size;
      } else if (pg.type === "page") {
        if (pg.limit_param) query[pg.limit_param] = pg.size;
        query[pg.page_param] = page + pg.page_start;
      }
      const data = await call(r, { path: l.path, query });
      if (page === 0) firstRaw = data;
      const batch = asArray(getPath(data, l.items_path));
      let added = 0;
      for (const raw of batch) {
        const item = normalizeItem(raw, l.map, cfg);
        if (!item) {
          skipped++;
          continue;
        }
        if (seen.has(item.supplierProductId)) continue;
        seen.add(item.supplierProductId);
        all.push(item);
        added++;
      }
      if (pg.type === "none" || added === 0 || (pg.type !== "none" && batch.length < pg.size)) break;
    }
    return { all, skipped, firstRaw };
  }

  // Small memo so a checkout against an API with no single-product
  // endpoint doesn't re-download the whole catalogue every time.
  let memo = { at: 0, list: null };
  async function findInList(id) {
    if (!memo.list || Date.now() - memo.at > 15000) {
      memo = { at: Date.now(), list: (await listPages()).all };
    }
    return memo.list.find((p) => p.supplierProductId === String(id)) || null;
  }

  return {
    configured: () => Boolean(row.enabled && row.base_url && (row.auth_type === "none" || row.api_key)),

    async listProducts() {
      const { all, skipped, firstRaw } = await listPages();
      if (skipped > 0 || all.length === 0) {
        const sample = asArray(getPath(firstRaw, cfg.list.items_path))[0];
        all.meta = {
          hint: `${all.length === 0 ? "No products found" : `${skipped} row(s) skipped`}. First row: ${JSON.stringify(sample ?? firstRaw ?? null).slice(0, 300)}`,
        };
      }
      return all;
    },

    async getProduct(id) {
      if (cfg.product?.path) {
        const data = await call(r, { path: cfg.product.path.replace("{id}", encodeURIComponent(id)) });
        const raw = getPath(data, cfg.product.items_path);
        const one = raw && typeof raw === "object" ? normalizeItem(raw, cfg.product.map, cfg) : null;
        if (one && one.stockKnown !== false) return one;
        if (one && cfg.stock_default !== null) return one;
      }
      const hit = await findInList(id);
      if (!hit) throw Object.assign(new Error(`${label}: product ${id} not found`), { status: 404 });
      return hit;
    },

    async getBalance() {
      if (!cfg.balance?.path) return { balance: null, raw: null };
      const data = await call(r, { path: cfg.balance.path });
      const v = num(getPath(data, cfg.balance.value_path));
      return { balance: Number.isFinite(v) ? v : null, raw: data };
    },

    async health() {
      if (cfg.balance?.path) {
        await call(r, { path: cfg.balance.path, timeoutMs: 8000 });
      } else {
        await listPages(1);
      }
      return { ok: true, status: 200 };
    },

    async purchase({ productId, quantity, email, orderId }) {
      const p = cfg.purchase;
      if (!p) throw new Error(`${label}: ordering is not configured`);
      const vars = { product_id: String(productId), quantity: Number(quantity), order_id: String(orderId || ""), email: email || "" };
      const filled = fill(p.body, vars);
      const data = await call(r, {
        method: p.method,
        path: p.path,
        query: p.method === "GET" ? filled : {},
        body: p.method === "GET" ? undefined : filled,
        timeoutMs: 25000,
        mutating: true,
      });

      if (p.success_path) {
        const v = getPath(data, p.success_path);
        const wanted = p.success_value
          ? p.success_value.split(",").map((s) => s.trim().toLowerCase())
          : null;
        const ok = wanted ? wanted.includes(String(v).toLowerCase()) : Boolean(v) && String(v).toLowerCase() !== "false";
        if (!ok) {
          const pending = v === undefined || /pend|process|queue|wait/i.test(String(v));
          const err = new Error(`${label} order not confirmed (${String(v)})`);
          err.ambiguous = pending; // pending = unknown outcome; an explicit failure is a clean "no"
          throw err;
        }
      }

      let items = getPath(data, p.items_path);
      if (typeof items === "string") items = items.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!Array.isArray(items) || items.length === 0) {
        const err = new Error(`${label} order went through but no delivery lines were found`);
        err.ambiguous = true;
        throw err;
      }
      items = items.map((it) =>
        typeof it === "string" || typeof it === "number"
          ? String(it)
          : p.items_field && it?.[p.items_field] !== undefined
          ? String(it[p.items_field])
          : JSON.stringify(it)
      );
      return {
        supplierOrderId: String(getPath(data, p.order_id_path) ?? ""),
        items,
        duplicate: false,
      };
    },

    // For the admin "Test" button: first page only, nothing is saved.
    async test() {
      const out = { list: null, balance: null, product: null };
      try {
        const { all, skipped, firstRaw } = await listPages(1);
        const rawFirst = asArray(getPath(firstRaw, cfg.list.items_path))[0];
        out.list = {
          ok: all.length > 0,
          count: all.length,
          skipped,
          sample: all.slice(0, 5).map(({ supplierProductId, title, cost, stock, stockKnown }) => ({ id: supplierProductId, title, cost, stock, stockKnown })),
          rawFirst: JSON.stringify(rawFirst ?? firstRaw ?? null).slice(0, 700),
          topKeys: firstRaw && typeof firstRaw === "object" ? Object.keys(firstRaw).slice(0, 15) : [],
        };
        if (all[0]) {
          try {
            const one = await this.getProduct(all[0].supplierProductId);
            out.product = { ok: true, id: one.supplierProductId, cost: one.cost, stock: one.stock };
          } catch (e) {
            out.product = { ok: false, error: e.message };
          }
        }
      } catch (e) {
        out.list = { ok: false, error: e.message };
      }
      try {
        const b = await this.getBalance();
        out.balance = cfg.balance?.path ? { ok: b.balance !== null, value: b.balance, raw: JSON.stringify(b.raw).slice(0, 300) } : { skipped: true };
      } catch (e) {
        out.balance = { ok: false, error: e.message };
      }
      return out;
    },
  };
}
