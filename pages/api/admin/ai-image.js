import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { PROVIDERS, configured } from "../../../lib/aiImage";

export const config = { maxDuration: 30 };

const BUCKET = "product-images";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

async function store(buffer, mime) {
  const ext = EXT[mime] || "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = () => supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  let { error } = await up();
  if (error && /not found/i.test(error.message || "")) {
    // First use: create the public bucket, then retry.
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    ({ error } = await up());
  }
  if (error) throw new Error(`Storage: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// GET  → which AI providers have a key set
// POST { provider: "auto" | id, prompt } → generates, stores in Supabase
//       Storage (public bucket "product-images"), returns { url }
export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    return res.status(200).json({ success: true, providers: configured() });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { provider = "auto", prompt } = req.body || {};
  const text = String(prompt || "").trim().slice(0, 400);
  if (!text) return res.status(400).json({ success: false, error: "prompt_required" });

  const avail = configured().map((p) => p.id);
  const order = provider === "auto" ? avail : avail.includes(provider) ? [provider] : [];
  if (!order.length) {
    return res.status(200).json({ success: false, error: "no_provider", detail: "No AI image key is set for that provider." });
  }

  const started = Date.now();
  const errors = [];
  for (const id of order) {
    if (Date.now() - started > 20000 && errors.length) break; // keep inside the 30s limit
    try {
      const { buffer, mime } = await PROVIDERS[id].run(text);
      if (!buffer?.length || buffer.length > 4_000_000) throw new Error("bad image size");
      const url = await store(buffer, mime);
      return res.status(200).json({ success: true, url, provider: id });
    } catch (e) {
      errors.push(`${PROVIDERS[id].label}: ${e.message}`);
    }
  }
  return res.status(200).json({ success: false, error: "all_failed", detail: errors.join(" · ") });
}
