// GET /api/messages/inbox
// Returns unread admin messages for the logged-in user (direct + broadcast).
// POST /api/messages/inbox  { id, reply? }
//   reply present → save reply text
//   reply absent  → mark message as read (dismiss banner)

import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  const supabaseServer = createPagesServerClient({ req, res });
  const { data: { session } } = await supabaseServer.auth.getSession();
  if (!session) return res.status(401).json({ success: false, error: "login_required" });

  const uid = session.user.id;

  if (req.method === "GET") {
    // Fetch direct messages for this user + broadcasts, that are unread
    const { data, error } = await supabaseAdmin
      .from("admin_messages")
      .select("id, subject, body, reply_body, reply_at, read_at, created_at")
      .or(`user_id.eq.${uid},user_id.is.null`)
      .is("read_at", null)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, messages: data || [] });
  }

  if (req.method === "POST") {
    const { id, reply } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "id_required" });

    // Verify this message is actually for this user (direct or broadcast)
    const { data: msg, error: fetchErr } = await supabaseAdmin
      .from("admin_messages")
      .select("id, user_id, reply_body")
      .eq("id", id)
      .single();

    if (fetchErr || !msg) return res.status(404).json({ success: false, error: "not_found" });
    if (msg.user_id !== null && msg.user_id !== uid)
      return res.status(403).json({ success: false, error: "forbidden" });

    const now = new Date().toISOString();
    const patch = { read_at: now, updated_at: now };

    if (reply && String(reply).trim()) {
      if (msg.reply_body) return res.status(409).json({ success: false, error: "already_replied" });
      if (String(reply).trim().length > 2000)
        return res.status(400).json({ success: false, error: "reply_too_long" });
      patch.reply_body = String(reply).trim();
      patch.reply_at = now;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("admin_messages")
      .update(patch)
      .eq("id", id);

    if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
