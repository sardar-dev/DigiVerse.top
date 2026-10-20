import { stripTags } from "./cleanText";

// Rewrites a supplier's product description with Google Gemini so each
// store's text is unique. Server-only; the key lives in GEMINI_API_KEY.
// Model names change often (old ones get retired), so a few are tried
// in order and the one that works is remembered for later calls.
const CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
].filter((m, i, arr) => m && arr.indexOf(m) === i);
let workingModel = null;
const BUDGET_MS = 26000; // whole call must fit the 30s function limit
const PER_TRY_MS = 14000;

const SYSTEM = `You rewrite product descriptions for an online store that sells digital subscriptions and accounts.
Rules:
- Keep the SAME format and structure as the original: same order, same line breaks, same bullet or emoji style, similar length (within about 20%).
- Keep every fact exactly: durations, plan names, numbers, requirements, warranty, delivery and activation steps. Never invent features, prices, guarantees or promises.
- Use fresh, clear wording so the text is unique, not a copy of the original. Natural, friendly, professional English.
- Do not mention any supplier, API or reseller source. Do not claim affiliation with or endorsement by any brand.
- Output ONLY the rewritten description as plain text. No title, no quotes, no markdown fences, no explanations.`;

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
    let r = await callGemini(
      model,
      key,
      { ...base, generationConfig: { temperature: 0.8, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } },
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
