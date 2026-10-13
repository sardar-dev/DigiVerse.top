import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("feedback")
      .select("id, email, message, read, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, feedback: data || [] });
  }

  if (req.method === "PATCH") {
    const { id, read } = req.body || {};
    if (!id || typeof read !== "boolean") {
      return res.status(400).json({ success: false, error: "invalid_request" });
    }
    const { error } = await supabaseAdmin.from("feedback").update({ read }).eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "invalid_request" });
    const { error } = await supabaseAdmin.from("feedback").delete().eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
