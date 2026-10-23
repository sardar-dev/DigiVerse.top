import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { cleanText, dbError, MAX_BODY, MAX_OPEN_TICKETS, MAX_TICKETS_PER_DAY } from "../../../lib/support";

// Logged-in customers only.
//   GET            → my tickets (newest activity first)
//   GET ?id=<uuid> → one of my tickets with its messages
//   POST { name, message, order_number? } → open a new ticket
export default async function handler(req, res) {
  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();
  if (!session) return res.status(401).json({ success: false, error: "login_required" });
  const uid = session.user.id;

  if (req.method === "GET") {
    const id = req.query.id;
    if (id) {
      const { data: ticket, error } = await supabaseAdmin
        .from("support_tickets")
        .select("id, ticket_number, name, order_number, status, created_at, updated_at")
        .eq("id", id)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) return res.status(500).json({ success: false, error: dbError(error) });
      if (!ticket) return res.status(404).json({ success: false, error: "ticket_not_found" });
      const { data: messages } = await supabaseAdmin
        .from("support_messages")
        .select("id, sender, body, created_at")
        .eq("ticket_id", ticket.id)
        .order("id", { ascending: true })
        .limit(100);
      return res.status(200).json({ success: true, ticket, messages: messages || [] });
    }
    const { data, error } = await supabaseAdmin
      .from("support_tickets")
      .select("id, ticket_number, name, order_number, status, created_at, updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) return res.status(500).json({ success: false, error: dbError(error) });
    return res.status(200).json({ success: true, tickets: data || [] });
  }

  if (req.method === "POST") {
    const name = cleanText(req.body?.name, 60);
    const message = cleanText(req.body?.message, MAX_BODY + 1);
    const orderNo = req.body?.order_number ? Number(req.body.order_number) : null;
    if (name.length < 2) return res.status(400).json({ success: false, error: "name_required" });
    if (message.length < 5) return res.status(400).json({ success: false, error: "message_required" });
    if (message.length > MAX_BODY) return res.status(400).json({ success: false, error: "message_too_long" });
    if (orderNo !== null && (!Number.isInteger(orderNo) || orderNo <= 0)) {
      return res.status(400).json({ success: false, error: "invalid_order_number" });
    }

    // Abuse limits: few open tickets at once, few new ones per day.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [open, recent] = await Promise.all([
      supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .in("status", ["open", "answered"]),
      supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gte("created_at", since),
    ]);
    if (open.error) return res.status(500).json({ success: false, error: dbError(open.error) });
    if ((open.count || 0) >= MAX_OPEN_TICKETS) {
      return res.status(429).json({ success: false, error: "too_many_open" });
    }
    if ((recent.count || 0) >= MAX_TICKETS_PER_DAY) {
      return res.status(429).json({ success: false, error: "too_many_today" });
    }

    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({ user_id: uid, name, order_number: orderNo })
      .select("id, ticket_number")
      .single();
    if (error) return res.status(500).json({ success: false, error: dbError(error) });

    const { error: mErr } = await supabaseAdmin
      .from("support_messages")
      .insert({ ticket_id: ticket.id, sender: "user", body: message });
    if (mErr) {
      await supabaseAdmin.from("support_tickets").delete().eq("id", ticket.id);
      return res.status(500).json({ success: false, error: dbError(mErr) });
    }
    return res.status(200).json({ success: true, id: ticket.id, ticket_number: ticket.ticket_number });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
