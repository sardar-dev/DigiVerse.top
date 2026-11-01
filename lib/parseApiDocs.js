/**
 * parseApiDocs — zero-dependency, no-API-key smart parser.
 *
 * Paste any supplier API docs (text, JSON examples, endpoint tables) and
 * this extracts everything needed to fill the ApiConnectionsTab form.
 *
 * Design: multi-pass heuristics — each pass builds on what earlier passes found.
 */

// ─── helpers ─────────────────────────────────────────────────────────────────

function lines(text) { return text.split(/\r?\n/); }

function tryJson(raw) {
  const s = String(raw || "").replace(/```json|```/gi, "").trim();
  for (const [a, b] of [["{", "}"], ["[", "]"]]) {
    const i = s.indexOf(a), j = s.lastIndexOf(b);
    if (i >= 0 && j > i) { try { return JSON.parse(s.slice(i, j + 1)); } catch {} }
  }
  return null;
}

/** Extract every JSON object/array block from text. */
function extractAllJson(text) {
  const results = [];
  for (const open of ["{", "["]) {
    const close = open === "{" ? "}" : "]";
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === open)  { if (depth === 0) start = i; depth++; }
      if (text[i] === close) { depth--; if (depth === 0 && start >= 0) { const p = tryJson(text.slice(start, i + 1)); if (p != null) results.push(p); start = -1; } }
    }
  }
  return results;
}

/** Dot-path get. */
function getPath(obj, path) {
  if (!path) return obj;
  return String(path).split(".").reduce((o, k) => o?.[k], obj);
}

/** All regex matches. */
function allMatches(text, re) {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];
}

// ─── PASS 1: collect all URLs ────────────────────────────────────────────────

function collectUrls(text) {
  return allMatches(text, /https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+/)
    .map(m => m[0].replace(/[.,;)'"]+$/, ""));
}

// ─── PASS 2: base URL ────────────────────────────────────────────────────────

function extractBaseUrl(text, urls) {
  if (!urls.length) return { value: "", confidence: "none" };

  // Group by host
  const byHost = {};
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      const host = parsed.origin;
      (byHost[host] = byHost[host] || []).push(parsed);
    } catch {}
  }

  // Pick the most-referenced host
  const topHost = Object.entries(byHost).sort((a, b) => b[1].length - a[1].length)[0];
  if (!topHost) return { value: "", confidence: "none" };

  const [origin, parsedUrls] = topHost;
  const pathnames = parsedUrls.map(u => u.pathname);

  // Find the longest common path prefix that isn't itself an endpoint name
  const endpointWords = /\/(products?|catalog|items|list|balance|wallet|order|purchase|buy|auth|token)(\b|$)/i;
  let commonPrefix = "";
  const segments = pathnames[0].split("/").filter(Boolean);
  for (let i = segments.length; i >= 1; i--) {
    const prefix = "/" + segments.slice(0, i).join("/");
    if (pathnames.every(p => p.startsWith(prefix))) {
      // Don't stop at an endpoint-like segment
      if (!endpointWords.test("/" + segments[i - 1])) {
        commonPrefix = prefix;
        break;
      }
    }
  }

  const value = (origin + commonPrefix).replace(/\/+$/, "") || origin;
  return { value, confidence: pathnames.length >= 2 ? "high" : "medium" };
}

// ─── PASS 3: categorise each URL ─────────────────────────────────────────────

/**
 * For each URL found, classify it by context: what METHOD appears nearby,
 * and what purpose does it seem to serve.
 */
function categoriseUrls(text, urls, baseUrl) {
  const lineArr = lines(text);
  const classified = [];

  // Also find path-only mentions like "GET /products" or "POST /orders"
  const pathOnlyMatches = allMatches(text, /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[a-zA-Z0-9/_?=&.-]+)/i);
  const extraPaths = pathOnlyMatches.map(m => ({
    url: null,
    path: m[2].trim(),
    method: m[1].toUpperCase(),
    purpose: "unknown",
    context: text.slice(Math.max(0, m.index - 80), m.index + 80),
    fromPathOnly: true,
  }));

  // Classify extra path-only entries
  for (const entry of extraPaths) {
    const ctx = (entry.context + " " + entry.path).toLowerCase();
    if (/product|catalog|catalogue|item|list|inventory/i.test(ctx)) entry.purpose = "products";
    else if (/balance|wallet|credit|fund|deposit/i.test(ctx)) entry.purpose = "balance";
    else if (/order|purchase|buy|checkout/i.test(ctx)) entry.purpose = "order";
    classified.push(entry);
  }

  for (const url of urls) {
    const lineIdx = lineArr.findIndex(l => l.includes(url));
    const context = lineArr.slice(Math.max(0, lineIdx - 3), lineIdx + 4).join(" ");
    const methodM = context.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i);
    const method = methodM ? methodM[1].toUpperCase() : null;

    let path = url;
    if (baseUrl) {
      try {
        const u = new URL(url);
        const b = new URL(baseUrl);
        if (u.origin === b.origin) {
          let rel = u.pathname;
          if (b.pathname !== "/" && rel.startsWith(b.pathname)) rel = rel.slice(b.pathname.length) || "/";
          path = (rel || "/") + u.search;
        }
      } catch {}
    }

    const ctx = context.toLowerCase();
    let purpose = "unknown";
    if (/product|catalog|catalogue|item|list|inventory/i.test(ctx)) purpose = "products";
    else if (/balance|wallet|credit|fund|deposit/i.test(ctx)) purpose = "balance";
    else if (/order|purchase|buy|checkout|create.*order/i.test(ctx)) purpose = "order";

    if (purpose === "unknown") {
      if (/product|catalog|item|list/i.test(url)) purpose = "products";
      else if (/balance|wallet/i.test(url)) purpose = "balance";
      else if (/order|purchase|buy/i.test(url)) purpose = "order";
    }

    classified.push({ url, path, method, purpose, context });
  }

  return classified;
}

// ─── PASS 4: pick best endpoint for each purpose ──────────────────────────────

function pickEndpoints(classified) {
  const pick = (purpose, preferredMethod) => {
    const matches = classified.filter(c => c.purpose === purpose);
    if (!matches.length) return null;
    // Prefer one with the right method
    const withMethod = matches.find(c => c.method === preferredMethod);
    return (withMethod || matches[0]).path;
  };
  return {
    products_path: pick("products", "GET"),
    balance_path:  pick("balance",  "GET"),
    order_path:    pick("order",    "POST"),
  };
}

// ─── PASS 5: auth detection ───────────────────────────────────────────────────

function extractAuth(text) {
  // Bearer
  if (/authorization\s*:\s*bearer|bearer\s+token|use.*bearer/i.test(text))
    return { auth_type: "bearer", auth_header: "", auth_prefix: "", confidence: "high" };

  // Custom header
  const headerM = text.match(/['"](x-api-key|x-auth-token|x-access-token|api-key)['"]|header[^:\n]*:\s*['"](X-[A-Za-z-]+)['"]/i);
  if (headerM)
    return { auth_type: "header", auth_header: (headerM[1] || headerM[2]).trim(), auth_prefix: "", confidence: "high" };

  // Query param
  const queryM = text.match(/[?&]([a-z_]{2,20}(?:key|token|auth)[a-z_]{0,10})\s*=/i)
    || text.match(/query\s+param[^:]*:\s*([a-z_]+)/i);
  if (queryM)
    return { auth_type: "query", auth_header: queryM[1], auth_prefix: "", confidence: "medium" };

  if (/basic\s+auth|username.*password/i.test(text))
    return { auth_type: "basic", auth_header: "", auth_prefix: "", confidence: "medium" };

  return { auth_type: "bearer", auth_header: "", auth_prefix: "", confidence: "low" };
}

// ─── PASS 6: field detection from JSON blocks ─────────────────────────────────

function detectProductFields(jsonBlocks, text) {
  // Collect all flat objects that look like product records
  const candidates = [];
  for (const block of jsonBlocks) {
    if (Array.isArray(block)) {
      for (const item of block) if (item && typeof item === "object" && !Array.isArray(item)) candidates.push(item);
    } else if (typeof block === "object") {
      // Check if it's directly a product (has id + price/name)
      const keys = Object.keys(block);
      const looksLikeProduct = keys.some(k => /\bid\b|product_id/i.test(k)) &&
                               keys.some(k => /price|cost|amount/i.test(k));
      if (looksLikeProduct) candidates.push(block);
      // Look inside array values
      for (const v of Object.values(block)) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item && typeof item === "object" && !Array.isArray(item)) candidates.push(item);
          }
        }
      }
    }
  }

  // Ranked field name candidates for each concept
  const ranks = {
    id:    ["id", "product_id", "pid", "item_id", "sku", "code"],
    title: ["name", "title", "product_name", "item_name", "label", "display_name"],
    price: ["price", "cost", "amount", "rate", "wholesale_price", "unit_price"],
    stock: ["stock", "quantity", "qty", "available", "inventory", "count"],
  };

  const result = {};
  for (const [concept, ranked] of Object.entries(ranks)) {
    for (const candidate of candidates) {
      const keys = Object.keys(candidate).map(k => k.toLowerCase());
      for (let i = 0; i < ranked.length; i++) {
        const exactKey = Object.keys(candidate).find(k => k.toLowerCase() === ranked[i]);
        if (exactKey) {
          const existing = result[concept];
          const newConf = i === 0 ? "high" : i <= 2 ? "medium" : "low";
          const confRank = { high: 2, medium: 1, low: 0 };
          if (!existing || confRank[newConf] > confRank[existing.confidence]) {
            result[concept] = { value: exactKey, confidence: newConf };
          }
          break;
        }
      }
    }
  }

  // IMPORTANT: if we found a product JSON block from the docs, use THOSE field names.
  // Order body fields (like product_id, quantity) are placeholders, not field names.
  // Distinguish by checking if the value looks like a placeholder (ALL_CAPS or {{...}})
  for (const [concept, found] of Object.entries(result)) {
    for (const candidate of candidates) {
      const val = candidate[found.value];
      if (val !== undefined && (typeof val === "string") && /^[A-Z_]+$|^\{\{/.test(String(val))) {
        // This looks like an order body placeholder, not a real product record
        // Try to find a non-placeholder block
        const realBlock = candidates.find(c => {
          const v = c[found.value];
          return v !== undefined && !/^[A-Z_]+$|^\{\{/.test(String(v));
        });
        if (!realBlock) {
          // All blocks look like placeholders — downgrade confidence
          result[concept].confidence = "low";
        }
      }
    }
  }

  return result;
}

// ─── PASS 7: items_path (where is the products array in the response?) ────────

function detectItemsPath(jsonBlocks) {
  for (const block of jsonBlocks) {
    if (typeof block !== "object" || Array.isArray(block)) continue;
    for (const [k, v] of Object.entries(block)) {
      if (!Array.isArray(v) || v.length === 0) continue;
      const item = v[0];
      if (!item || typeof item !== "object") continue;
      const itemKeys = Object.keys(item);
      const hasId    = itemKeys.some(k2 => /\bid\b|product_id/i.test(k2));
      const hasPrice = itemKeys.some(k2 => /price|cost|amount/i.test(k2));
      const hasName  = itemKeys.some(k2 => /name|title/i.test(k2));
      if ((hasId && hasPrice) || (hasId && hasName) || (hasPrice && hasName)) {
        return { value: k, confidence: "high" };
      }
    }
  }
  // Check one level deeper (e.g. response.data.products)
  for (const block of jsonBlocks) {
    if (typeof block !== "object" || Array.isArray(block)) continue;
    for (const [k, v] of Object.entries(block)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [k2, v2] of Object.entries(v)) {
        if (!Array.isArray(v2) || v2.length === 0) continue;
        const item = v2[0];
        if (!item || typeof item !== "object") continue;
        const keys = Object.keys(item);
        if (keys.some(k3 => /\bid\b|product_id/i.test(k3)) && keys.some(k3 => /price|name/i.test(k3))) {
          return { value: `${k}.${k2}`, confidence: "high" };
        }
      }
    }
  }
  return { value: "", confidence: "low" };
}

// ─── PASS 8: balance value path ───────────────────────────────────────────────

function detectBalancePath(jsonBlocks, text) {
  // Look for JSON blocks that have a "balance" somewhere (possibly nested)
  for (const block of jsonBlocks) {
    if (typeof block !== "object" || Array.isArray(block)) continue;

    // Direct: { balance: 0 }
    if ("balance" in block && typeof block.balance === "number")
      return { value: "balance", confidence: "high" };

    // One level deep: { reseller: { balance: 0 } }
    for (const [k, v] of Object.entries(block)) {
      if (v && typeof v === "object" && "balance" in v && typeof v.balance === "number")
        return { value: `${k}.balance`, confidence: "high" };
    }

    // Two levels deep
    for (const [k, v] of Object.entries(block)) {
      if (!v || typeof v !== "object") continue;
      for (const [k2, v2] of Object.entries(v)) {
        if (v2 && typeof v2 === "object" && "balance" in v2)
          return { value: `${k}.${k2}.balance`, confidence: "medium" };
      }
    }
  }

  // Text-based: "balance": 0 anywhere
  const textMatch = text.match(/"balance"\s*:\s*[\d.]+/);
  if (textMatch) return { value: "balance", confidence: "medium" };

  return { value: "balance", confidence: "low" };
}

// ─── PASS 9: order response fields ────────────────────────────────────────────

function detectOrderFields(jsonBlocks, text) {
  // Look for order response examples: usually shown after POST description
  // Heuristic: find a JSON block that has an "order_id" or "id" plus "items"/"keys"/"codes"
  const orderResponseBlocks = [];
  for (const block of jsonBlocks) {
    if (typeof block !== "object" || Array.isArray(block)) continue;
    const keys = Object.keys(block).map(k => k.toLowerCase());
    const hasOrderish = keys.some(k => /order_id|transaction|ref|reference/i.test(k));
    const hasItemish = keys.some(k => /items|keys|codes|accounts|credentials|delivery|data/i.test(k));
    if (hasOrderish || hasItemish) orderResponseBlocks.push(block);
  }

  let order_items_path = { value: "items", confidence: "low" };
  let order_id_path = { value: "order_id", confidence: "low" };

  for (const block of orderResponseBlocks) {
    // Items path
    for (const k of Object.keys(block)) {
      if (/\bitems\b|keys|codes|accounts|credentials/i.test(k)) {
        order_items_path = { value: k, confidence: "high" };
        break;
      }
      if (/\bdata\b|result|delivery/i.test(k) && Array.isArray(block[k])) {
        order_items_path = { value: k, confidence: "medium" };
      }
    }
    // Order ID path
    for (const k of Object.keys(block)) {
      if (/order_id|transaction_id|ref_id|reference/i.test(k)) {
        order_id_path = { value: k, confidence: "high" };
        break;
      }
      if (/^id$/i.test(k)) {
        order_id_path = { value: k, confidence: "medium" };
      }
    }
  }

  // Text fallbacks
  if (order_id_path.confidence === "low") {
    const m = text.match(/"(order_id|transaction_id|ref_id|reference_id)"\s*:/);
    if (m) order_id_path = { value: m[1], confidence: "medium" };
  }

  return { order_items_path, order_id_path };
}

// ─── PASS 10: supplier name from docs ─────────────────────────────────────────

function detectLabel(text) {
  // First meaningful line that isn't a heading marker or URL
  for (const line of lines(text)) {
    const clean = line.replace(/^[#*•📋🔑💰🛒📦✦→>-]+\s*/, "").trim();
    if (clean.length > 3 && clean.length < 60 && !/https?:\/\//.test(clean) && /[a-z]/i.test(clean)) {
      return clean.replace(/\s*(api|documentation|docs|developer|guide)\s*$/i, "").trim();
    }
  }
  return "";
}

// ─── main export ──────────────────────────────────────────────────────────────

export function parseApiDocs(text) {
  if (!text || typeof text !== "string" || text.trim().length < 20)
    return { _meta: { ok: false, error: "Paste some API documentation first." } };

  const warnings = [];

  // Pass 1: URLs
  const urls = [...new Set(collectUrls(text))];

  // Pass 2: base URL
  const baseUrlResult = extractBaseUrl(text, urls);
  if (!baseUrlResult.value) warnings.push("Could not detect the API base URL — fill it in manually.");

  // Pass 3 & 4: classify URLs → endpoints
  const classified = categoriseUrls(text, urls, baseUrlResult.value);
  const eps = pickEndpoints(classified);

  // Confidence for endpoints
  const epConf = (val, defVal) => {
    if (!val) return "none";
    const c = classified.find(u => u.path === val);
    if (c?.method) return "high";     // method explicitly found nearby
    if (val !== defVal) return "medium"; // at least it's different from placeholder
    return "low";
  };

  const products_path = eps.products_path || "/?action=products";
  const balance_path  = eps.balance_path  || "/?action=balance";
  const order_path    = eps.order_path    || "/?action=order";

  if (!eps.products_path) warnings.push("Could not detect the products endpoint path — using default.");
  if (!eps.balance_path)  warnings.push("Could not detect the balance endpoint path — using default.");
  if (!eps.order_path)    warnings.push("Could not detect the order endpoint path — using default.");

  // Pass 5: auth
  const auth = extractAuth(text);
  if (auth.confidence === "low") warnings.push("Auth type defaulted to Bearer — verify in the docs.");

  // Pass 6: JSON blocks
  const jsonBlocks = extractAllJson(text);

  // Pass 7: items_path
  const itemsPath = detectItemsPath(jsonBlocks);
  if (itemsPath.confidence === "low") warnings.push("Could not detect the products array path — leave blank and test first.");

  // Pass 6 (fields): product fields
  const productFields = detectProductFields(jsonBlocks, text);
  if (!productFields.id)    warnings.push("Could not detect the product ID field name — default is 'id'.");
  if (!productFields.price) warnings.push("Could not detect the price field name — default is 'price'.");

  // Pass 8: balance field
  const balanceField = detectBalancePath(jsonBlocks, text);

  // Pass 9: order response fields
  const { order_items_path, order_id_path } = detectOrderFields(jsonBlocks, text);

  // Suggested label
  const label = detectLabel(text);

  // Build form state
  const form = {
    label:            label || "",
    base_url:         baseUrlResult.value,
    auth_type:        auth.auth_type,
    auth_header:      auth.auth_header,
    auth_prefix:      auth.auth_prefix,
    products_path,
    balance_path,
    order_path,
    items_path:       itemsPath.value,
    field_id:         productFields.id?.value    || "id",
    field_title:      productFields.title?.value || "name",
    field_price:      productFields.price?.value || "price",
    field_stock:      productFields.stock?.value || "stock",
    balance_field:    balanceField.value,
    order_items_path: order_items_path.value,
    order_id_path:    order_id_path.value,
  };

  const confidences = {
    base_url:         baseUrlResult.confidence,
    auth_type:        auth.confidence,
    products_path:    epConf(eps.products_path, "/?action=products"),
    balance_path:     epConf(eps.balance_path,  "/?action=balance"),
    order_path:       epConf(eps.order_path,    "/?action=order"),
    items_path:       itemsPath.confidence,
    field_id:         productFields.id?.confidence    || "low",
    field_price:      productFields.price?.confidence || "low",
    balance_field:    balanceField.confidence,
    order_items_path: order_items_path.confidence,
    order_id_path:    order_id_path.confidence,
  };

  // Quality based on the most important fields (base URL + auth + 3 endpoints)
  const critical = ["base_url", "auth_type", "products_path", "balance_path", "order_path"];
  const criticalHigh = critical.filter(k => confidences[k] === "high").length;
  const confValues = Object.values(confidences);
  const highCount = confValues.filter(v => v === "high").length;
  const lowCount  = confValues.filter(v => v === "low" || v === "none").length;
  const quality = criticalHigh >= 4 ? "good" : criticalHigh >= 2 ? "partial" : "low";

  return {
    ...form,
    _meta: { ok: true, quality, confidences, warnings },
  };
}
