import { stripTags } from "./cleanText";

// Rewrites a supplier's product description with Google Gemini so each
// store's text is unique. Server-only; the key lives in GEMINI_API_KEY.
// `gemini-flash-latest` always points at the current free-tier Flash model.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const TIMEOUT_MS = 25000;

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

export async function rewriteDescription({ title, description }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "ai_not_configured" };
  const original = stripTags(String(description || "")).trim();
  if (!original) return { ok: false, error: "no_description" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            {
              role: "user",
              parts: [{ text: `Product: ${title || ""}\n\nOriginal description:\n${original}` }],
            },
          ],
          generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
        }),
      }
    );
    if (r.status === 429) return { ok: false, error: "ai_rate_limited" };
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.warn("[aiRewrite] gemini error", r.status, t.slice(0, 300));
      return { ok: false, error: r.status === 400 || r.status === 403 ? "ai_key_invalid" : "ai_failed" };
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();
    if (!text) return { ok: false, error: "ai_empty" };
    return { ok: true, text: stripTags(text).slice(0, 4000), original };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "ai_timeout" : "ai_failed" };
  } finally {
    clearTimeout(timer);
  }
}
