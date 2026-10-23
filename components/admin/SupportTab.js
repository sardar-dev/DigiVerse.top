import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/States";

const when = (d) => new Date(d).toLocaleString();
const BADGE = {
  open: "bg-danger-soft text-danger",
  answered: "bg-success-soft text-success",
  closed: "bg-border text-muted",
};
const ERR = {
  run_migration_019: "Run supabase/migration_019_support_tickets.sql in the Supabase SQL editor first.",
};

export function StatusPill({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${BADGE[status] || BADGE.closed}`}>
      {status === "open" ? "Needs reply" : status}
    </span>
  );
}

// Admin support inbox: list → open a ticket → reply / close. Loads only
// when this tab opens or you act; nothing polls.
export default function SupportTab() {
  const [tickets, setTickets] = useState(null);
  const [filter, setFilter] = useState("open");
  const [active, setActive] = useState(null); // { ticket, messages }
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadList() {
    const d = await (await fetch("/api/admin/support")).json();
    if (d.success) {
      setTickets(d.tickets);
      setError("");
    } else setError(ERR[d.error] || d.error);
  }
  useEffect(() => {
    loadList();
  }, []);

  async function openTicket(id) {
    setError("");
    const d = await (await fetch(`/api/admin/support?id=${id}`)).json();
    if (d.success) {
      setActive({ ticket: d.ticket, messages: d.messages });
      setReply("");
    } else setError(ERR[d.error] || d.error);
  }

  async function post(body) {
    setBusy(true);
    const d = await (
      await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
    setBusy(false);
    if (!d.success) setError(ERR[d.error] || d.error);
    return d.success;
  }

  async function send() {
    if (!reply.trim() || !active) return;
    if (await post({ id: active.ticket.id, message: reply })) {
      await openTicket(active.ticket.id);
      loadList();
    }
  }
  async function setStatus(status) {
    if (await post({ id: active.ticket.id, status })) {
      await openTicket(active.ticket.id);
      loadList();
    }
  }

  const counts = (tickets || []).reduce((a, t) => ({ ...a, [t.status]: (a[t.status] || 0) + 1 }), {});
  const shown = (tickets || []).filter((t) => filter === "all" || t.status === filter);

  if (active) {
    const t = active.ticket;
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setActive(null)} className="text-sm text-brand hover:underline">
          ← All tickets
        </button>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-lg font-semibold text-ink">Ticket #{t.ticket_number}</div>
              <div className="text-sm text-muted">
                {t.name} · <span className="break-all">{t.email || "unknown email"}</span>
                {t.balance !== null && t.balance !== undefined && ` · balance $${Number(t.balance).toFixed(2)}`}
                {t.order_number ? ` · about order #${t.order_number}` : ""}
              </div>
              <div className="text-xs text-muted">Opened {when(t.created_at)}</div>
            </div>
            <StatusPill status={t.status} />
          </div>

          <div className="mt-4 space-y-3">
            {active.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[90%] rounded-xl px-4 py-2.5 text-sm ${
                  m.sender === "admin" ? "ml-auto bg-brand text-white" : "bg-bg text-ink"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-1 text-[11px] ${m.sender === "admin" ? "text-white/70" : "text-muted"}`}>
                  {m.sender === "admin" ? "You" : t.name} · {when(m.created_at)}
                </div>
              </div>
            ))}
          </div>

          {error && <Alert variant="error" className="mt-3">{error}</Alert>}
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Write your reply…"
            className="mt-4 w-full rounded-lg border border-border bg-bg p-3 text-sm text-ink"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <PrimaryButton onClick={send} disabled={busy || !reply.trim()}>
              {busy ? "Sending…" : "Send reply"}
            </PrimaryButton>
            {t.status !== "closed" ? (
              <SecondaryButton onClick={() => setStatus("closed")} disabled={busy}>
                Close ticket
              </SecondaryButton>
            ) : (
              <SecondaryButton onClick={() => setStatus("open")} disabled={busy}>
                Reopen
              </SecondaryButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Support tickets"
        description="Customers write from their account; reply here and they see it in their Support page. Closed tickets are deleted after 60 days."
        action={<SecondaryButton onClick={loadList}>Refresh</SecondaryButton>}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {[
          ["open", `Needs reply (${counts.open || 0})`],
          ["answered", `Answered (${counts.answered || 0})`],
          ["closed", `Closed (${counts.closed || 0})`],
          ["all", "All"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              filter === k ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tickets === null && !error && <LoadingState label="Loading tickets…" />}
      {tickets && shown.length === 0 && <p className="text-sm text-muted">Nothing here.</p>}
      <ul className="space-y-2">
        {shown.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => openTicket(t.id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-card hover:border-brand/40"
            >
              <span className="min-w-0">
                <span className="font-mono text-sm font-semibold text-ink">#{t.ticket_number}</span>{" "}
                <span className="text-sm text-ink">{t.name}</span>
                <span className="block break-all text-xs text-muted">
                  {t.email || "unknown"} {t.order_number ? `· order #${t.order_number}` : ""} · {when(t.updated_at)}
                </span>
              </span>
              <StatusPill status={t.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
