import { supabaseAdmin } from "../../lib/supabaseAdmin";

// Public: the community channel button (WhatsApp or Telegram). Stored in
// app_meta (no migration): `whatsapp_link` = the link, `channel_type` =
// "whatsapp" | "telegram". Edge-cached, so it costs ~nothing per visit.
export default async function handler(req, res) {
  const { data } = await supabaseAdmin
    .from("app_meta")
    .select("key, value")
    .in("key", ["whatsapp_link", "channel_type"]);
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({
    whatsapp_link: m.whatsapp_link || "",
    channel_type: m.channel_type === "telegram" ? "telegram" : "whatsapp",
  });
}
