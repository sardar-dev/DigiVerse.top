import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { cleanText, dbError, MAX_BODY, MAX_MESSAGES_PER_TICKET } from "../../../lib/support";

// POST { ticket_id, message } — customer replies on their own ticket.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();
  if (!session) return res.status(401).json({ success: false, error: "login_required" });

  const message = cleanText(req.body?.message, MAX_BODY + 1);
  const ticketId = req.body?.ticket_id;
  if (!ticketId) return res.status(400).json({ success: false, error: "invalid_request" });
  if (message.length < 1) return res.status(400).json({ success: false, error: "message_required" });
  if (message.length > MAX_BODY) return res.status(400).json({ success: false, error: "message_too_long" });

  const { data: ticket, error } = await supabaseAdmin
    .from("support_tickets")
    .select("id, status")
    .eq("id", ticketId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ success: false, error: dbError(error) });
  if (!ticket) return res.status(404).json({ success: false, error: "ticket_not_found" });
  if (ticket.status === "closed") return res.status(409).json({ success: false, error: "ticket_closed" });

  const { count } = await supabaseAdmin
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticket.id);
  if ((count || 0) >= MAX_MESSAGES_PER_TICKET) {
    return res.status(429).json({ success: false, error: "thread_full" });
  }

  const { error: mErr } = await supabaseAdmin
    .from("support_messages")
    .insert({ ticket_id: ticket.id, sender: "user", body: message });
  if (mErr) return res.status(500).json({ success: false, error: dbError(mErr) });

  await supabaseAdmin
    .from("support_tickets")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", ticket.id);
  return res.status(200).json({ success: true });
}
