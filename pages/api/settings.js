import { supabaseAdmin } from "../../lib/supabaseAdmin";

// Public: the community channel button (WhatsApp or Telegram). Stored in
// app_meta (no migration): `whatsapp_link` = the link, `channel_type` =
// "whatsapp" | "telegram". Edge-cached, so it costs ~nothing per visit.
export default async function handler(req, res) {
  const { data } = await supabaseAdmin
    .from("app_meta")
    .select("key, value")
    .in("key", ["whatsapp_link", "channel_type", "buy_modal_ticker", "site_notice", "google_auth_enabled"]);
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));

  // Notice popup: only sent to visitors when the admin has it switched on.
  let notice = null;
  try {
    const n = JSON.parse(m.site_notice || "null");
    if (n && n.enabled && (n.title || n.message)) {
      notice = {
        title: n.title || "",
        message: n.message || "",
        button_label: n.button_label || "",
        button_url: n.button_url || "",
        v: String(n.v || "1"),
      };
    }
  } catch {}

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({
    whatsapp_link: m.whatsapp_link || "",
    channel_type: m.channel_type === "telegram" ? "telegram" : "whatsapp",
    buy_modal_ticker: m.buy_modal_ticker || "",
    google_auth_enabled: m.google_auth_enabled === "true",
    notice,
  });
}
