import { callGemini, CANDIDATES, apiMsg } from "./aiRewrite";
import { assertPublicHttps, normalizeConfig } from "./suppliers/custom";

// "Research an API" for the admin panel: reads the documentation the admin
// pasted (and/or fetches a docs URL), optionally searches the web, and
// drafts the connection settings. The API key is NEVER sent to the AI.
const BUDGET_MS = 50000;

const SYSTEM = `You configure a generic reseller-API connector. From the API documentation given, output ONE JSON object and nothing else (no markdown fences, no commentary).

Schema:
{
 "label": "short display name",
 "base_url": "https://host/path-prefix  (no trailing slash; include version prefix like /v1 if every endpoint has it)",
 "auth_type": "bearer | header | query | basic | none",
 "auth_header": "header name for auth_type=header (e.g. X-API-Key) or the query parameter name for auth_type=query; else empty",
 "auth_prefix": "text before the key in a custom header value, e.g. 'Token '; usually empty",
 "extra_headers": { },
 "config": {
   "supports_email": false,          // true only if the order endpoint accepts a customer email
   "idempotent_orders": false,       // true only if orders take a client-supplied unique id so retrying can never double-charge
   "stock_default": null,            // number ONLY if the product list has no stock figure (then a fixed assumed stock); else null
   "list": {
     "path": "/products",            // endpoint returning the product catalogue (GET)
     "query": { },                   // fixed query params, if needed
     "items_path": "data.products",  // dot-path to the ARRAY of products in the JSON response ("" if the response itself is the array)
     "pagination": { "type": "none | offset | page", "size": 50, "limit_param": "limit", "offset_param": "offset", "page_param": "page", "page_start": 1, "max_pages": 40 },
     "map": { "id": "id", "title": "name", "price": "price", "stock": "stock", "description": "description", "category": "category" }   // dot-paths INSIDE one product; price = what the supplier charges us per unit; leave a value "" if absent
   },
   "product": { "path": "/products/{id}", "items_path": "", "map": { } },   // optional single-product endpoint for live stock; omit if none
   "balance": { "path": "/balance", "value_path": "data.balance" },         // optional wallet balance endpoint; omit if none
   "purchase": {
     "method": "POST", "path": "/orders",
     "body": { "product_id": "{{product_id}}", "quantity": "{{quantity|number}}", "external_id": "{{order_id}}" },   // placeholders: {{product_id}} {{quantity}} {{order_id}} {{email}}; add |number for numeric JSON values
     "items_path": "data.items",     // dot-path to the delivered accounts/keys/codes (array of strings, or objects)
     "items_field": "",              // if items are objects: the field holding the text
     "order_id_path": "data.order_id",
     "success_path": "", "success_value": ""   // optional: a status field and the value(s) meaning success (comma separated)
   }
 },
 "notes": ["short, plain warnings: anything you were unsure about or that the admin must check"],
 "confidence": "high | medium | low"
}

Rules:
- Use ONLY facts from the documentation or search results. Never invent endpoints or field names. If something is unknown, leave it empty and say so in notes.
- If the docs show example JSON responses, derive items_path and map from them exactly.
- Dot-paths use "." and array positions like "items.0.code". 
- If the docs contain an API key, ignore it; keys are handled separately.
- Output valid JSON only.`;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchDocsText(url) {
  assertPublicHttps(url);
  const r = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DocsReader/1.0)", Accept: "text/html,application/json,text/plain" },
  });
  if (!r.ok) throw new Error(`Docs page answered ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  const raw = (await r.text()).slice(0, 400000);
  const text = /json|text\/plain|yaml/i.test(ct) ? raw : stripHtml(raw);
  return text.slice(0, 40000);
}

function extractJson(text) {
  const t = String(text || "").replace(/```json|```/gi, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

export async function researchApi({ name, website, docsUrl, docsText, quickStart, hints, apiKey, current, feedback }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "ai_not_configured" };

  let fetched = "";
  let fetchNote = "";
  if (docsUrl) {
    try {
      fetched = await fetchDocsText(docsUrl);
      if (fetched.length < 300) fetchNote = "The docs page had very little readable text (it may be rendered by JavaScript). Paste the documentation text instead for best results.";
    } catch (e) {
      fetchNote = `Could not read the docs URL: ${e.message}`;
    }
  }

  const scrub = (t) => (apiKey && apiKey.length > 5 ? String(t || "").split(apiKey).join("<API_KEY>") : String(t || ""));
  const parts = [
    `Provider name: ${name || "(not given)"}`,
    website ? `Website: ${website}` : "",
    hints ? `Admin-provided connection details:\n${scrub(hints)}` : "",
    quickStart ? `Quick start from the provider:\n${scrub(quickStart).slice(0, 8000)}` : "",
    docsText ? `API documentation (pasted):\n${scrub(docsText).slice(0, 60000)}` : "",
    fetched ? `API documentation (fetched from ${docsUrl}):\n${scrub(fetched)}` : "",
    current ? `Current draft configuration (improve it, keep what works):\n${JSON.stringify(current).slice(0, 6000)}` : "",
    feedback ? `Result of testing the current draft against the real API (fix the mapping so this works):\n${scrub(feedback).slice(0, 4000)}` : "",
  ].filter(Boolean);

  const enoughDocs = (docsText || "").length + fetched.length + (quickStart || "").length > 500;
  const useSearch = !enoughDocs;
  if (useSearch) {
    parts.push(
      "The documentation above is missing or too short. Search the web for this provider's official API documentation and use it. If you cannot find reliable documentation, say so in notes and leave unknown fields empty."
    );
  }

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: parts.join("\n\n---\n\n") }] }],
    ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
  };

  const started = Date.now();
  const trail = [];
  for (const model of CANDIDATES) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 6000) break;
    const thinking = /gemini-3/.test(model) ? { thinkingLevel: "low" } : { thinkingBudget: 0 };
    const gen = (g) => ({ ...body, generationConfig: { temperature: 0.2, maxOutputTokens: 8192, ...g } });
    let r = await callGemini(model, key, gen({ thinkingConfig: thinking }), Math.min(left, 40000));
    if (r.status === 400 && /thinking/i.test(apiMsg(r))) {
      r = await callGemini(model, key, gen({}), Math.max(6000, BUDGET_MS - (Date.now() - started)));
    }
    if ([500, 502, 503, 504].includes(r.status) && BUDGET_MS - (Date.now() - started) > 15000) {
      await new Promise((x) => setTimeout(x, 2000));
      r = await callGemini(model, key, gen({ thinkingConfig: thinking }), Math.min(35000, BUDGET_MS - (Date.now() - started)));
    }
    if (r.status === 200) {
      const text = (r.json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      const obj = extractJson(text);
      if (obj) {
        const sources = (r.json?.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
          .map((c) => c.web?.uri)
          .filter(Boolean)
          .slice(0, 5);
        return {
          ok: true,
          model,
          label: String(obj.label || name || "").slice(0, 60),
          base_url: String(obj.base_url || "").slice(0, 300),
          auth_type: ["bearer", "header", "query", "basic", "none"].includes(obj.auth_type) ? obj.auth_type : "bearer",
          auth_header: String(obj.auth_header || "").slice(0, 60),
          auth_prefix: String(obj.auth_prefix || "").slice(0, 40),
          extra_headers: obj.extra_headers && typeof obj.extra_headers === "object" ? obj.extra_headers : {},
          config: normalizeConfig(obj.config),
          notes: [fetchNote, ...(Array.isArray(obj.notes) ? obj.notes : [])].filter(Boolean).map((n) => String(n).slice(0, 300)).slice(0, 8),
          confidence: ["high", "medium", "low"].includes(obj.confidence) ? obj.confidence : "medium",
          searched: useSearch,
          sources,
        };
      }
      trail.push(`${model}: answer was not valid JSON`);
      continue;
    }
    if (r.status === 429) return { ok: false, error: "ai_rate_limited", detail: apiMsg(r) };
    trail.push(`${model} → ${r.timeout ? "timed out" : `HTTP ${r.status}: ${apiMsg(r)}`}`);
  }
  return { ok: false, error: "ai_failed", detail: trail.join("  |  ") };
}
