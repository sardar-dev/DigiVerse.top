import { stripTags } from "./cleanText";

// Rewrites a supplier's product description with Google Gemini so each
// store's text is unique. Server-only; the key lives in GEMINI_API_KEY.
// Model names change often (old ones get retired), so a few are tried
// in order and the one that works is remembered for later calls.
const CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
].filter((m, i, arr) => m && arr.indexOf(m) === i);
let workingModel = null;
const BUDGET_MS = 26000; // whole call must fit the 30s function limit
const PER_TRY_MS = 14000;

const SYSTEM = `You write product descriptions for an online store that sells digital subscriptions and accounts. Rewrite the supplier's description so it is clear, well organised and unique.

Format (plain text only — NO markdown symbols like ** or # or backticks):
1. First line: one short sentence saying exactly what the product is, starting with one fitting emoji.
2. Blank line, then "✨ What you get" followed by 3-6 short bullets, each starting with "• ".
3. Blank line, then "🚀 How it works" followed by numbered steps ("1. ", "2. ") covering delivery and activation — ONLY if the original says how it is delivered or activated.
4. Blank line, then "⚠️ Good to know" followed by "• " bullets for requirements, warranty, region, limits or conditions — ONLY if the original mentions any.
Leave out any section the original gives no facts for. Keep it compact: usually 400-900 characters; never much longer than the original.

Rules:
- Keep every fact exactly: durations, plan names, numbers, requirements, warranty, delivery and activation steps. Never invent features, prices, guarantees or promises.
- Fresh, natural, friendly-professional English; do not copy the original's sentences.
- Do not mention any supplier, API or reseller source. Do not claim affiliation with or endorsement by any brand.
- Output ONLY the description. No title line, no quotes, no explanations.`;

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callGemini(model, key, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      }
    );
    const raw = await r.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {}
    return { status: r.status, json, raw };
  } catch (e) {
    return { status: 0, timeout: e?.name === "AbortError", raw: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const apiMsg = (r) => (r.json?.error?.message || r.raw || "").slice(0, 300);

export async function rewriteDescription({ title, description }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "ai_not_configured" };
  const original = stripTags(String(description || "")).trim();
  if (!original) return { ok: false, error: "no_description" };

  const base = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `Product: ${title || ""}\n\nOriginal description:\n${original}` }],
      },
    ],
  };
  const models = workingModel
    ? [workingModel, ...CANDIDATES.filter((m) => m !== workingModel)]
    : CANDIDATES;

  const started = Date.now();
  let last = { error: "ai_failed", detail: "" };
  for (const model of models) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 4000) break;
    const timeout = Math.min(PER_TRY_MS, left);
    // Thinking off = much faster for a plain rewrite. Some models reject
    // the setting, so retry once without it.
    // Gemini 3.x thinks in levels ("minimal" is unsupported on 3.8 Flash);
    // 2.x uses a token budget where 0 turns it off.
    const thinking = /gemini-3/.test(model) ? { thinkingLevel: "low" } : { thinkingBudget: 0 };
    let r = await callGemini(
      model,
      key,
      { ...base, generationConfig: { temperature: 0.8, maxOutputTokens: 2048, thinkingConfig: thinking } },
      timeout
    );
    if (r.status === 400 && /thinking/i.test(apiMsg(r))) {
      r = await callGemini(
        model,
        key,
        { ...base, generationConfig: { temperature: 0.8, maxOutputTokens: 2048 } },
        Math.max(3000, BUDGET_MS - (Date.now() - started))
      );
    }

    if (r.status === 200) {
      const text = (r.json?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();
      if (text) {
        workingModel = model;
        return { ok: true, text: stripTags(text).slice(0, 4000), original, model };
      }
      last = { error: "ai_empty", detail: `${model}: ${r.json?.candidates?.[0]?.finishReason || "no text"}` };
      continue;
    }
    console.warn("[aiRewrite]", model, r.status, apiMsg(r));
    if (r.timeout) {
      last = { error: "ai_timeout", detail: `${model} did not answer in time` };
      continue;
    }
    if (r.status === 429) return { ok: false, error: "ai_rate_limited", detail: apiMsg(r) };
    // Bad key / retired model / wrong model name → try the next model.
    last = {
      error: r.status === 401 || r.status === 403 ? "ai_key_invalid" : "ai_failed",
      detail: `${model} → HTTP ${r.status}: ${apiMsg(r)}`,
    };
  }
  return { ok: false, ...last };
}
