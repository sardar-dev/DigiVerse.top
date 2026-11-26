import { requireAdmin } from "../../../lib/requireAdmin";
import { fetchImage } from "../../../lib/imageFetch";

export const config = { maxDuration: 30 };

// Admin-only. Streams a remote image through our own origin so the browser can
// draw it on a canvas (remote hosts do not send CORS headers).
//   GET ?url=<https link>            → only the hosts the logo search returns
//   GET ?url=<https link>&mode=any   → any public https image the admin pasted
export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "method_not_allowed" });
  try {
    const { buffer, type } = await fetchImage(String(req.query.url || ""), { allowAny: req.query.mode === "any" });
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=300");
    // SVG from a third party must never run scripts in our origin.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(400).json({ success: false, error: "fetch_failed", detail: e?.message || "Could not load that image." });
  }
}
