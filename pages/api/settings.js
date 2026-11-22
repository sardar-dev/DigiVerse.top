import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getReferralSettings } from "../../lib/referralSettings";

// Public: the community channel button (WhatsApp or Telegram), referral status, and announcements.
// Stored in app_meta and referral_settings. Edge-cached with short TTL for quick updates.
export default async function handler(req, res) {
  const [{ data }, refSettings] = await Promise.all([
    supabaseAdmin
      .from("app_meta")
      .select("key, value")
      .in("key", ["whatsapp_link", "channel_type", "buy_modal_ticker", "site_notice", "google_auth_enabled"]),
    getReferralSettings().catch(() => null),
  ]);
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

  res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
  return res.status(200).json({
    whatsapp_link: m.whatsapp_link || "",
    channel_type: m.channel_type === "telegram" ? "telegram" : "whatsapp",
    buy_modal_ticker: m.buy_modal_ticker || "",
    google_auth_enabled: m.google_auth_enabled === "true",
    referral_enabled: refSettings?.referral_enabled !== false,
    notice,
  });
}
