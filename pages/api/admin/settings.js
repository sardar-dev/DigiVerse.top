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
      .in("key", ["whatsapp_link", "channel_type", "buy_modal_ticker", "site_notice", "google_auth_enabled"]);
    const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    let notice = { enabled: false, title: "", message: "", button_label: "", button_url: "", v: "1" };
    try {
      notice = { ...notice, ...JSON.parse(m.site_notice || "{}") };
    } catch {}
    return res.status(200).json({
      success: true,
      notice,
      whatsapp_link: m.whatsapp_link || "",
      channel_type: m.channel_type === "telegram" ? "telegram" : "whatsapp",
      buy_modal_ticker: m.buy_modal_ticker || "",
      google_auth_enabled: m.google_auth_enabled === "true",
    });
  }

  if (req.method === "POST") {
    const { whatsapp_link, channel_type, buy_modal_ticker, notice, google_auth_enabled } = req.body || {};
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
    const ticker = String(buy_modal_ticker || "").slice(0, 300).trim();
    const now = new Date().toISOString();

    // Notice popup. `v` changes whenever the text changes, so visitors who
    // closed an older notice see the new one.
    const nt = notice && typeof notice === "object" ? notice : {};
    const btnUrl = String(nt.button_url || "").trim();
    if (btnUrl) {
      try {
        if (!/^https?:$/.test(new URL(btnUrl).protocol)) throw new Error("bad protocol");
      } catch {
        return res.status(400).json({ success: false, error: "invalid_notice_url" });
      }
    }
    const noticeClean = {
      enabled: Boolean(nt.enabled),
      title: String(nt.title || "").slice(0, 120).trim(),
      message: String(nt.message || "").slice(0, 1500).trim(),
      button_label: String(nt.button_label || "").slice(0, 40).trim(),
      button_url: btnUrl,
    };
    let prev = {};
    try {
      const { data: row } = await supabaseAdmin.from("app_meta").select("value").eq("key", "site_notice").maybeSingle();
      prev = JSON.parse(row?.value || "{}");
    } catch {}
    const changed = ["title", "message", "button_label", "button_url"].some((k) => prev[k] !== noticeClean[k]);
    noticeClean.v = changed || !prev.v ? String(Date.now()) : prev.v;

    const { error } = await supabaseAdmin.from("app_meta").upsert([
      { key: "site_notice", value: JSON.stringify(noticeClean), updated_at: now },
      { key: "whatsapp_link", value: link, updated_at: now },
      { key: "channel_type", value: type, updated_at: now },
      { key: "buy_modal_ticker", value: ticker, updated_at: now },
      { key: "google_auth_enabled", value: String(Boolean(google_auth_enabled)), updated_at: now },
    ]);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
