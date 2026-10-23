import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { cleanText, dbError, MAX_BODY } from "../../../lib/support";

// GET            → ticket list (open first), with the customer's email
// GET ?id=<uuid> → one ticket with all messages
// POST { id, message }  → admin reply (ticket becomes "answered")
// POST { id, status }   → open | answered | closed
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const id = req.query.id;
    if (id) {
      const { data: ticket, error } = await supabaseAdmin
        .from("support_tickets")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) return res.status(500).json({ success: false, error: dbError(error) });
      if (!ticket) return res.status(404).json({ success: false, error: "ticket_not_found" });
      const [{ data: messages }, { data: profile }] = await Promise.all([
        supabaseAdmin
          .from("support_messages")
          .select("id, sender, body, created_at")
          .eq("ticket_id", id)
          .order("id", { ascending: true })
          .limit(100),
        supabaseAdmin.from("profiles").select("email, balance").eq("id", ticket.user_id).maybeSingle(),
      ]);
      return res.status(200).json({
        success: true,
        ticket: { ...ticket, email: profile?.email || null, balance: profile?.balance ?? null },
        messages: messages || [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("support_tickets")
      .select("id, ticket_number, user_id, name, order_number, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(150);
    if (error) return res.status(500).json({ success: false, error: dbError(error) });
    const ids = [...new Set((data || []).map((t) => t.user_id))];
    const emails = new Map();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email").in("id", ids);
      for (const p of profiles || []) emails.set(p.id, p.email);
    }
    const rank = { open: 0, answered: 1, closed: 2 };
    const tickets = (data || [])
      .map((t) => ({ ...t, email: emails.get(t.user_id) || null }))
      .sort((a, b) => rank[a.status] - rank[b.status]);
    return res.status(200).json({ success: true, tickets });
  }

  if (req.method === "POST") {
    const { id, message, status } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "invalid_request" });

    if (message !== undefined) {
      const body = cleanText(message, MAX_BODY + 1);
      if (!body) return res.status(400).json({ success: false, error: "message_required" });
      if (body.length > MAX_BODY) return res.status(400).json({ success: false, error: "message_too_long" });
      const { error } = await supabaseAdmin
        .from("support_messages")
        .insert({ ticket_id: id, sender: "admin", body });
      if (error) return res.status(500).json({ success: false, error: dbError(error) });
      await supabaseAdmin
        .from("support_tickets")
        .update({ status: "answered", updated_at: new Date().toISOString() })
        .eq("id", id);
      return res.status(200).json({ success: true });
    }

    if (["open", "answered", "closed"].includes(status)) {
      const { error } = await supabaseAdmin
        .from("support_tickets")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return res.status(500).json({ success: false, error: dbError(error) });
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ success: false, error: "invalid_request" });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
