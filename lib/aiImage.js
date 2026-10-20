// Server-side AI image providers. Each takes a prompt and returns
// { buffer, mime } or throws. Keys live in env vars; a provider with no
// key is simply "not configured". Order = "Auto" order.
const TIMEOUT = 22000;

async function post(url, headers, body, ms = TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? "timed out" : String(e?.message || e));
  } finally {
    clearTimeout(t);
  }
}

async function fail(r, name) {
  const t = (await r.text().catch(() => "")).slice(0, 200);
  throw new Error(`${name} HTTP ${r.status}${t ? `: ${t}` : ""}`);
}

const b64 = (s) => Buffer.from(s, "base64");

export const PROVIDERS = {
  gemini: {
    label: "Gemini",
    env: () => process.env.GEMINI_API_KEY,
    async run(prompt) {
      const key = process.env.GEMINI_API_KEY;
      const models = [process.env.GEMINI_IMAGE_MODEL, "gemini-2.5-flash-image", "gemini-3.1-flash-image"].filter(Boolean);
      let last = "no model worked";
      for (const m of models) {
        const r = await post(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
          { "x-goog-api-key": key },
          {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
          }
        );
        if (!r.ok) {
          last = `${m} HTTP ${r.status}`;
          if (r.status === 429) throw new Error(last + " (free limit)");
          continue;
        }
        const d = await r.json();
        const part = (d?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
        if (part) return { buffer: b64(part.inlineData.data), mime: part.inlineData.mimeType || "image/png" };
        last = `${m} returned no image`;
      }
      throw new Error(`Gemini: ${last}`);
    },
  },

  huggingface: {
    label: "Hugging Face",
    env: () => process.env.HF_API_KEY,
    async run(prompt) {
      const r = await post(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        { Authorization: `Bearer ${process.env.HF_API_KEY}`, Accept: "image/png" },
        { inputs: prompt }
      );
      if (!r.ok) await fail(r, "Hugging Face");
      const mime = r.headers.get("content-type") || "image/jpeg";
      if (!mime.startsWith("image/")) throw new Error("Hugging Face returned no image");
      return { buffer: Buffer.from(await r.arrayBuffer()), mime };
    },
  },

  together: {
    label: "Together",
    env: () => process.env.TOGETHER_API_KEY,
    async run(prompt) {
      const r = await post(
        "https://api.together.xyz/v1/images/generations",
        { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
        {
          model: "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width: 512,
          height: 512,
          steps: 4,
          n: 1,
          response_format: "b64_json",
        }
      );
      if (!r.ok) await fail(r, "Together");
      const d = await r.json();
      const data = d?.data?.[0]?.b64_json;
      if (!data) throw new Error("Together returned no image");
      return { buffer: b64(data), mime: "image/jpeg" };
    },
  },

  cloudflare: {
    label: "Cloudflare",
    env: () => process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN,
    async run(prompt) {
      const r = await post(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
        { Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
        { prompt, steps: 4 }
      );
      if (!r.ok) await fail(r, "Cloudflare");
      const d = await r.json();
      const data = d?.result?.image;
      if (!data) throw new Error("Cloudflare returned no image");
      return { buffer: b64(data), mime: "image/jpeg" };
    },
  },
};

export const configured = () =>
  Object.entries(PROVIDERS)
    .filter(([, p]) => p.env())
    .map(([id, p]) => ({ id, label: p.label }));
