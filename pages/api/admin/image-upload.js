import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

export const config = { maxDuration: 30, api: { bodyParser: { sizeLimit: "3mb" } } };

const BUCKET = "product-images";

// Magic bytes, so only real PNG / JPEG / WebP files are stored.
function sniff(buf) {
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length > 12 && buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

// POST { dataUrl: "data:image/png;base64,..." }
// Stores the finished product image in Supabase Storage (public bucket
// "product-images", created on first use) and returns our own https link.
export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl || ""));
  if (!m) return res.status(400).json({ success: false, error: "bad_image" });
  const buffer = Buffer.from(m[1], "base64");
  if (buffer.length > 2_000_000) return res.status(400).json({ success: false, error: "too_large" });
  const kind = sniff(buffer);
  if (!kind) return res.status(400).json({ success: false, error: "unsupported_type" });

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${kind.ext}`;
  const up = () => supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType: kind.mime, upsert: false, cacheControl: "31536000" });
  let { error } = await up();
  if (error && /not found/i.test(error.message || "")) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    ({ error } = await up());
  }
  if (error) return res.status(500).json({ success: false, error: "storage_failed", detail: error.message });
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return res.status(200).json({ success: true, url });
}
