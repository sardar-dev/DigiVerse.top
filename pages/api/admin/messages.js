// GET  /api/admin/messages          → list all messages (with replies)
// POST /api/admin/messages          → send a new message
// DELETE /api/admin/messages?id=…   → delete a message

import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

async function requireAdmin(req, res) {
  const supabaseServer = createPagesServerClient({ req, res });
  const { data: { session } } = await supabaseServer.auth.getSession();
  if (!session) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", session.user.id)
    .single();
  return profile?.is_admin ? session : null;
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return res.status(403).json({ success: false, error: "forbidden" });

  if (req.method === "GET") {
    // Email lookup for compose form
    if (req.query.lookup_email) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", req.query.lookup_email)
        .single();
      if (!profile) return res.status(404).json({ success: false, user_id: null });
      return res.status(200).json({ success: true, user_id: profile.id });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_messages")
      .select("id, user_id, subject, body, reply_body, reply_at, read_at, created_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Attach user email for display
    const userIds = [...new Set(data.filter((m) => m.user_id).map((m) => m.user_id))];
    let emailMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      emailMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.email]));
    }

    const messages = data.map((m) => ({
      ...m,
      user_email: m.user_id ? (emailMap[m.user_id] || m.user_id) : null,
    }));

    return res.status(200).json({ success: true, messages });
  }

  if (req.method === "POST") {
    const { user_id, subject, body } = req.body || {};
    if (!subject || !body)
      return res.status(400).json({ success: false, error: "subject_and_body_required" });
    if (subject.length > 120 || body.length > 2000)
      return res.status(400).json({ success: false, error: "too_long" });

    // If user_id provided, verify it exists
    if (user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", user_id)
        .single();
      if (!profile) return res.status(404).json({ success: false, error: "user_not_found" });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_messages")
      .insert({ user_id: user_id || null, subject: subject.trim(), body: body.trim() })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: "id_required" });
    const { error } = await supabaseAdmin.from("admin_messages").delete().eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
