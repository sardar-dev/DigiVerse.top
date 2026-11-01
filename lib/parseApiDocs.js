/**
 * parseApiDocs — zero-dependency, no-API-key smart API docs parser.
 *
 * Accepts any combination of:
 *  - Full API documentation text
 *  - Endpoint tables ("GET /?action=products")
 *  - Sample JSON responses
 *  - Auth instructions
 *
 * Returns form fields ready to merge into ApiConnectionsTab state.
 */

// ─── helpers ──────────────────────────────────────────────────────────────────

const L = (text) => text.split(/\r?\n/);

function tryJson(s) {
  s = String(s || "").replace(/```json\b|```/gi, "").trim();
  for (const [o, c] of [["{","}"],["[","]"]]) {
    const a = s.indexOf(o), b = s.lastIndexOf(c);
    if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b+1)); } catch {}
  }
  return null;
}

/** Pull every {...} and [...] block from text, parsed. */
function allJsonBlocks(text) {
  const out = [];
  for (const [o,c] of [["{","}"],["[","]"]]) {
    let d=0, s=-1;
    for (let i=0;i<text.length;i++) {
      if (text[i]===o) { if(!d) s=i; d++; }
      if (text[i]===c) { d--; if(!d&&s>=0){ const p=tryJson(text.slice(s,i+1)); if(p!=null) out.push({parsed:p,src:text.slice(s,i+1)}); s=-1; } }
    }
  }
  return out;
}

function ga(text, re) {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g')?re.flags:re.flags+'g'))];
}

function norm(s) { return String(s||'').toLowerCase().trim(); }

// ─── STEP 1: extract all URLs ─────────────────────────────────────────────────

function extractUrls(text) {
  return [...new Set(
    ga(text, /https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+/)
      .map(m => m[0].replace(/[.,;)'">\]]+$/, ''))
  )];
}

// ─── STEP 2: base URL ─────────────────────────────────────────────────────────

function extractBaseUrl(text, urls) {
  // First check for an explicit "Endpoint URL" label — highest priority
  const explicitMatch = text.match(/endpoint\s+url[:\s]+\n?\s*(https?:\/\/[^\s\n]+)/i)
    || text.match(/base\s+url[:\s]+(https?:\/\/[^\s\n]+)/i)
    || text.match(/api\s+url[:\s]+(https?:\/\/[^\s\n]+)/i);
  if (explicitMatch) {
    return { value: explicitMatch[1].trim().replace(/\/+$/, ''), confidence: 'high' };
  }

  if (!urls.length) return { value: '', confidence: 'none' };

  // Group by host, count references
  const byHost = {};
  for (const u of urls) {
    try { const h = new URL(u).origin; byHost[h] = (byHost[h]||[]); byHost[h].push(new URL(u)); } catch {}
  }
  const topEntry = Object.entries(byHost).sort((a,b)=>b[1].length-a[1].length)[0];
  if (!topEntry) return { value: '', confidence: 'none' };
  const [origin, parsed] = topEntry;

  // Find common pathname prefix, excluding endpoint-name segments
  const endpointRe = /^(products?|catalog|items?|list|balance|wallet|order|purchase|buy|auth|token|resell)$/i;
  const paths = parsed.map(u => u.pathname.split('/').filter(Boolean));
  let prefix = paths[0] || [];
  for (const segs of paths.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix = prefix.slice(0, i);
  }
  // Remove trailing endpoint-name segment
  while (prefix.length && endpointRe.test(prefix[prefix.length-1])) prefix.pop();

  const value = (origin + (prefix.length ? '/'+prefix.join('/') : '')).replace(/\/+$/, '');
  return { value, confidence: parsed.length >= 2 ? 'high' : 'medium' };
}

// ─── STEP 3: auth ─────────────────────────────────────────────────────────────

function extractAuth(text) {
  if (/authorization\s*:\s*bearer|use.*bearer\s+token|bearer\s+auth/i.test(text))
    return { auth_type:'bearer', auth_header:'', auth_prefix:'', confidence:'high' };

  const hm = text.match(/['"](x-api-key|x-auth-token|x-access-token|api-key|apikey)['"\s:]/i)
    || text.match(/header[^:\n]*?:\s*['"](X-[A-Za-z-]{3,40})['"]/i);
  if (hm) return { auth_type:'header', auth_header:(hm[1]||hm[2]).trim(), auth_prefix:'', confidence:'high' };

  const qm = text.match(/[?&]([a-z_]{2,20}(?:key|token|api)[a-z_]{0,10})\s*=/i);
  if (qm) return { auth_type:'query', auth_header:qm[1], auth_prefix:'', confidence:'medium' };

  if (/basic\s+auth/i.test(text)) return { auth_type:'basic', auth_header:'', auth_prefix:'', confidence:'medium' };

  return { auth_type:'bearer', auth_header:'', auth_prefix:'', confidence:'low' };
}

// ─── STEP 4: classify every URL/path mention with its purpose ────────────────

const PURPOSE_RE = {
  products: /product|catalog|catalogue|items?\b|list\b|inventory/i,
  balance:  /balance|wallet|credit|fund|deposit/i,
  order:    /\border\b|purchase|buy\b|checkout|create.{0,10}order/i,
};

function classifyContext(ctx) {
  for (const [p, re] of Object.entries(PURPOSE_RE)) if (re.test(ctx)) return p;
  return null;
}

function extractEndpoints(text, baseUrl) {
  const lineArr = L(text);

  // Collect candidates: { path, method, purpose, score }
  const candidates = { products:[], balance:[], order:[] };

  function addCandidate(purpose, path, method, score) {
    if (!purpose || !path) return;
    candidates[purpose].push({ path, method, score });
  }

  // Pattern A: bullet/table "Product list: GET /?action=products"
  for (const m of ga(text, /(?:product\s*list|products?|catalog)[^\n]*?:\s*(GET)\s+(\/[^\s\n]+)/i))
    addCandidate('products', m[2].trim(), 'GET', 10);
  for (const m of ga(text, /(?:balance|wallet)[^\n]*?:\s*(GET)\s+(\/[^\s\n]+)/i))
    addCandidate('balance', m[2].trim(), 'GET', 10);
  for (const m of ga(text, /(?:place\s+order|create\s+order|order)[^\n]*?:\s*(POST)\s+(\/[^\s\n]+)/i))
    addCandidate('order', m[2].trim(), 'POST', 10);

  // Pattern B: standalone "GET /path" lines
  for (const m of ga(text, /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[a-zA-Z0-9/_?=&.-]+)/i)) {
    const method = m[1].toUpperCase();
    const path = m[2].trim();
    // look at surrounding context (±2 lines)
    const li = lineArr.findIndex(l => l.includes(m[0]));
    const ctx = lineArr.slice(Math.max(0,li-2), li+3).join(' ');
    const purpose = classifyContext(ctx) || classifyContext(path);
    addCandidate(purpose, path, method, 7);
  }

  // Pattern C: full URL with method context
  for (const url of extractUrls(text)) {
    const li = lineArr.findIndex(l => l.includes(url));
    const ctx = lineArr.slice(Math.max(0,li-3), li+4).join(' ');
    const mm = ctx.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i);
    const method = mm ? mm[1].toUpperCase() : null;
    const purpose = classifyContext(ctx) || classifyContext(url);
    if (!purpose) continue;
    let path = url;
    if (baseUrl) {
      try {
        const u = new URL(url), b = new URL(baseUrl);
        if (u.origin === b.origin) {
          let rel = u.pathname;
          if (b.pathname !== '/' && rel.startsWith(b.pathname)) rel = rel.slice(b.pathname.length)||'/';
          path = (rel||'/') + u.search;
        }
      } catch {}
    }
    addCandidate(purpose, path, method, method ? 8 : 5);
  }

  // Pick highest-score candidate per purpose
  const result = {};
  for (const [purpose, list] of Object.entries(candidates)) {
    if (!list.length) { result[purpose] = null; continue; }
    list.sort((a,b) => b.score - a.score);
    result[purpose] = list[0];
  }
  return result;
}

// ─── STEP 5: product field names from JSON blocks ─────────────────────────────

// Score map: each concept → [best_match, ..., fallback]
const FIELD_RANKS = {
  id:    ['id','product_id','pid','item_id','sku','numeric_id','code'],
  title: ['name','title','product_name','item_name','label','display_name','slug'],
  price: ['price','cost','amount','rate','wholesale_price','unit_price'],
  stock: ['stock','quantity','qty','available','inventory','in_stock','count'],
};

/** Is this a placeholder value (not a real product record)? */
function isPlaceholder(val) {
  return typeof val === 'string' && (/^[A-Z0-9_]{3,}$/.test(val) || /^\{\{/.test(val) || val === 'YOUR_ORDER_ID');
}

/** Is this object a real product record (not an order body)? */
function looksLikeProductRecord(obj) {
  const keys = Object.keys(obj).map(norm);
  const hasId    = keys.some(k => /\bid\b|product_id/.test(k));
  const hasPrice = keys.some(k => /price|cost/.test(k));
  const hasName  = keys.some(k => /name|title/.test(k));
  // Check values aren't all placeholders
  const vals = Object.values(obj);
  const allPlaceholder = vals.every(v => isPlaceholder(v));
  return !allPlaceholder && ((hasId && hasPrice) || (hasId && hasName) || (hasPrice && hasName));
}

function detectProductFields(jsonBlocks) {
  // Gather real product records from all JSON blocks
  const records = [];
  for (const { parsed } of jsonBlocks) {
    if (Array.isArray(parsed)) {
      parsed.slice(0,5).filter(x => x && typeof x==='object' && looksLikeProductRecord(x))
        .forEach(x => records.push(x));
    } else if (parsed && typeof parsed==='object') {
      if (looksLikeProductRecord(parsed)) records.push(parsed);
      // Look inside arrays
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v)) {
          v.slice(0,5).filter(x => x && typeof x==='object' && looksLikeProductRecord(x))
            .forEach(x => records.push(x));
        }
      }
    }
  }

  if (!records.length) return {};

  const result = {};
  for (const [concept, ranked] of Object.entries(FIELD_RANKS)) {
    for (const rec of records) {
      const keys = Object.keys(rec);
      for (let i=0; i<ranked.length; i++) {
        const match = keys.find(k => k.toLowerCase() === ranked[i]);
        if (match) {
          const conf = i===0 ? 'high' : i<=2 ? 'medium' : 'low';
          const prev = result[concept];
          if (!prev || ({high:2,medium:1,low:0}[conf] > {high:2,medium:1,low:0}[prev.confidence]))
            result[concept] = { value: match, confidence: conf };
          break;
        }
      }
    }
  }
  return result;
}

// ─── STEP 6: products array path ─────────────────────────────────────────────

function detectItemsPath(jsonBlocks) {
  for (const { parsed } of jsonBlocks) {
    if (typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    // Direct key → array of product-like objects
    for (const [k,v] of Object.entries(parsed)) {
      if (!Array.isArray(v) || !v.length) continue;
      const item = v[0];
      if (item && typeof item==='object' && looksLikeProductRecord(item))
        return { value: k, confidence: 'high' };
    }
    // Nested one level: { data: { products: [...] } }
    for (const [k,v] of Object.entries(parsed)) {
      if (!v || typeof v!=='object' || Array.isArray(v)) continue;
      for (const [k2,v2] of Object.entries(v)) {
        if (!Array.isArray(v2) || !v2.length) continue;
        const item = v2[0];
        if (item && typeof item==='object' && looksLikeProductRecord(item))
          return { value:`${k}.${k2}`, confidence:'high' };
      }
    }
  }
  return { value:'', confidence:'low' };
}

// ─── STEP 7: balance value path ──────────────────────────────────────────────

function detectBalancePath(jsonBlocks, text) {
  const BALANCE_KEYS = ['balance','wallet','credit','amount','funds'];
  for (const { parsed } of jsonBlocks) {
    if (typeof parsed!=='object'||Array.isArray(parsed)) continue;
    // Direct
    for (const bk of BALANCE_KEYS) {
      if (bk in parsed && typeof parsed[bk]==='number')
        return { value: bk, confidence:'high' };
    }
    // One level deep
    for (const [k,v] of Object.entries(parsed)) {
      if (!v||typeof v!=='object'||Array.isArray(v)) continue;
      for (const bk of BALANCE_KEYS) {
        if (bk in v) return { value:`${k}.${bk}`, confidence:'high' };
      }
    }
    // Two levels deep
    for (const [k,v] of Object.entries(parsed)) {
      if (!v||typeof v!=='object'||Array.isArray(v)) continue;
      for (const [k2,v2] of Object.entries(v)) {
        if (!v2||typeof v2!=='object'||Array.isArray(v2)) continue;
        for (const bk of BALANCE_KEYS) {
          if (bk in v2) return { value:`${k}.${k2}.${bk}`, confidence:'medium' };
        }
      }
    }
  }
  if (/"balance"\s*:/.test(text)) return { value:'balance', confidence:'medium' };
  return { value:'balance', confidence:'low' };
}

// ─── STEP 8: order response fields ───────────────────────────────────────────

function detectOrderResponseFields(jsonBlocks, text) {
  const ITEM_KEYS  = ['items','keys','accounts','codes','credentials','delivery','data','result','products'];
  const ORDERID_KEYS = ['order_id','transaction_id','ref_id','reference_id','id'];

  let order_items_path = { value:'items',    confidence:'low' };
  let order_id_path    = { value:'order_id', confidence:'low' };

  for (const { parsed } of jsonBlocks) {
    if (typeof parsed!=='object'||Array.isArray(parsed)) continue;
    const keys = Object.keys(parsed);
    // Has both item-list AND order-id looking keys → likely an order response
    const hasItems   = keys.some(k => ITEM_KEYS.some(ik=>norm(k)===ik));
    const hasOrderId = keys.some(k => ORDERID_KEYS.some(oi=>norm(k)===oi));
    if (!hasItems && !hasOrderId) continue;

    for (const k of keys) {
      const nk = norm(k);
      if (ITEM_KEYS.some(ik=>nk===ik) && order_items_path.confidence!=='high')
        order_items_path = { value:k, confidence:'high' };
      if (ORDERID_KEYS.some(oi=>nk===oi) && order_id_path.confidence!=='high')
        order_id_path = { value:k, confidence:'high' };
    }
  }
  return { order_items_path, order_id_path };
}

// ─── STEP 9: label from docs ─────────────────────────────────────────────────

function extractLabel(text) {
  for (const line of L(text)) {
    const clean = line.replace(/^[#*•📋🔑💰🛒📦🔧✦\-→>\s]+/, '').trim();
    if (clean.length > 3 && clean.length < 60 && /[a-z]/i.test(clean) && !/https?:/i.test(clean))
      return clean.replace(/\s*(api|documentation|docs|developer|guide|reseller)\s*$/i,'').trim();
  }
  return '';
}

// ─── main export ──────────────────────────────────────────────────────────────

export function parseApiDocs(text) {
  if (!text||typeof text!=='string'||text.trim().length<10)
    return { _meta:{ ok:false, error:'Paste some API documentation first.' } };

  const warnings = [];

  // 1. URLs
  const urls = extractUrls(text);

  // 2. Base URL
  const baseUrlR = extractBaseUrl(text, urls);
  if (!baseUrlR.value) warnings.push('Could not detect the base URL — fill it in manually.');

  // 3. Auth
  const auth = extractAuth(text);
  if (auth.confidence==='low') warnings.push('Auth type defaulted to Bearer — verify in the docs.');

  // 4. Endpoints
  const eps = extractEndpoints(text, baseUrlR.value);
  const products_path = eps.products?.path || '/?action=products';
  const balance_path  = eps.balance?.path  || '/?action=balance';
  const order_path    = eps.order?.path    || '/?action=order';
  const epConf = (e) => !e?.path ? 'none' : e.method ? 'high' : 'medium';

  if (!eps.products?.path) warnings.push('Could not detect the products endpoint.');
  if (!eps.balance?.path)  warnings.push('Could not detect the balance endpoint.');
  if (!eps.order?.path)    warnings.push('Could not detect the order endpoint.');

  // 5–8. JSON-derived fields
  const blocks   = allJsonBlocks(text);
  const fields   = detectProductFields(blocks);
  const itemsP   = detectItemsPath(blocks);
  const balanceF = detectBalancePath(blocks, text);
  const { order_items_path, order_id_path } = detectOrderResponseFields(blocks, text);

  // Warn only for fields we truly couldn't find
  if (!fields.id)    warnings.push("Product ID field not found in response sample — using default 'id'.");
  if (!fields.price) warnings.push("Price field not found in response sample — using default 'price'.");

  const label = extractLabel(text);

  // ── Build form ──────────────────────────────────────────────────────────────
  const form = {
    label,
    base_url:         baseUrlR.value,
    auth_type:        auth.auth_type,
    auth_header:      auth.auth_header,
    auth_prefix:      auth.auth_prefix,
    products_path,
    balance_path,
    order_path,
    items_path:       itemsP.value,
    field_id:         fields.id?.value    || 'id',
    field_title:      fields.title?.value || 'name',
    field_price:      fields.price?.value || 'price',
    field_stock:      fields.stock?.value || 'stock',
    balance_field:    balanceF.value,
    order_items_path: order_items_path.value,
    order_id_path:    order_id_path.value,
  };

  const confidences = {
    base_url:         baseUrlR.confidence,
    auth_type:        auth.confidence,
    products_path:    epConf(eps.products),
    balance_path:     epConf(eps.balance),
    order_path:       epConf(eps.order),
    items_path:       itemsP.confidence,
    field_id:         fields.id?.confidence    || 'low',
    field_price:      fields.price?.confidence || 'low',
    balance_field:    balanceF.confidence,
    order_items_path: order_items_path.confidence,
    order_id_path:    order_id_path.confidence,
  };

  // Quality: based on the 5 critical fields
  const critical = ['base_url','auth_type','products_path','balance_path','order_path'];
  const critHigh = critical.filter(k => confidences[k]==='high').length;
  const quality  = critHigh>=5 ? 'good' : critHigh>=3 ? 'partial' : 'low';

  return { ...form, _meta:{ ok:true, quality, confidences, warnings } };
}
