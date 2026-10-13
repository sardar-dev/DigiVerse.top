import crypto from "crypto";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_HOUR = 5; // per visitor (hashed IP)

// Public endpoint (no login) — kept cheap and spam-resistant:
// length limits, a honeypot field, and a small per-IP hourly cap.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { email, message, website } = req.body || {};

  // Honeypot: real users never see/fill this field. Pretend success.
  if (website) return res.status(200).json({ success: true });

  const cleanEmail = String(email || "").trim().slice(0, 200);
  const cleanMessage = String(message || "").trim();
  if (!EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ success: false, error: "invalid_email" });
  }
  if (cleanMessage.length < 3) {
    return res.status(400).json({ success: false, error: "message_required" });
  }
  if (cleanMessage.length > 2000) {
    return res.status(400).json({ success: false, error: "message_too_long" });
  }

  const ip =
    String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
      .split(",")[0]
      .trim() || "unknown";
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("feedback")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((count || 0) >= MAX_PER_HOUR) {
    return res.status(429).json({ success: false, error: "too_many_requests" });
  }

  const { error } = await supabaseAdmin
    .from("feedback")
    .insert({ email: cleanEmail, message: cleanMessage, ip_hash: ipHash });
  if (error) return res.status(500).json({ success: false, error: "save_failed" });

  return res.status(200).json({ success: true });
}
