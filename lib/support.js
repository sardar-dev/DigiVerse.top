// Shared helpers for the support ticket system.
export const MAX_BODY = 2000;
export const MAX_OPEN_TICKETS = 3; // per customer, open or answered
export const MAX_TICKETS_PER_DAY = 5;
export const MAX_MESSAGES_PER_TICKET = 60;

export const cleanText = (s, max) =>
  String(s || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max);

// Tables missing (migration 019 not run yet) → a clear error code.
export const dbError = (error) =>
  /support_tickets|support_messages|support_ticket_seq|relation .* does not exist/i.test(error?.message || "")
    ? "run_migration_019"
    : error?.message || "db_error";
