import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

const HOSTS = {
  whatsapp: /^(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com|whatsapp\.com|www\.whatsapp\.com)$/i,
  telegram: /^(t\.me|telegram\.me|telegram\.dog|www\.t\.me)$/i,
};

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const { data } = await supabaseAdmin
      .from("app_meta")
      .select("key, value")
      .in("key", ["whatsapp_link", "channel_type"]);
    const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    return res.status(200).json({
      success: true,
      whatsapp_link: m.whatsapp_link || "",
      channel_type: m.channel_type === "telegram" ? "telegram" : "whatsapp",
    });
  }

  if (req.method === "POST") {
    const { whatsapp_link, channel_type } = req.body || {};
    const type = channel_type === "telegram" ? "telegram" : "whatsapp";
    const link = String(whatsapp_link || "").trim();
    if (link) {
      let host = "";
      try {
        const u = new URL(link);
        if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
        host = u.hostname;
      } catch {
        return res.status(400).json({ success: false, error: "invalid_url" });
      }
      // Catch a Telegram link saved under "WhatsApp" (or the reverse).
      if (!HOSTS[type].test(host)) {
        return res.status(400).json({ success: false, error: `link_not_${type}` });
      }
    }
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("app_meta").upsert([
      { key: "whatsapp_link", value: link, updated_at: now },
      { key: "channel_type", value: type, updated_at: now },
    ]);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
