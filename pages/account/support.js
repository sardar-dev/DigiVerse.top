import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Alert from "../../components/ui/Alert";
import { EmptyState, LoadingState } from "../../components/ui/States";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Button";
import { FormInput } from "../../components/ui/FormInput";
import { useT, intlLocale } from "../../lib/i18n";

const when = (d, locale) => new Date(d).toLocaleString(intlLocale(locale));
const BADGE = {
  open: "bg-warning-soft text-warning",
  answered: "bg-success-soft text-success",
  closed: "bg-border text-muted",
};
export default function Support() {
  const { t, locale } = useT();
  const LABEL = { open: t("Waiting for us"), answered: t("We replied"), closed: t("Closed") };
  const ERR = {
    name_required: t("Please enter your name."),
    message_required: t("Please write a message (at least a few words)."),
    message_too_long: t("That message is too long (2000 characters max)."),
    invalid_order_number: t("Order number must be a number, like 1042."),
    too_many_open: t("You already have 3 open tickets. Please wait for a reply or close one first."),
    too_many_today: t("You've opened several tickets today. Please add to an existing one."),
    ticket_closed: t("This ticket is closed. Please open a new one."),
    thread_full: t("This ticket has reached its message limit. Please open a new one."),
    run_migration_019: t("Support isn't set up yet. Please try again later."),
  };
  const [session, setSession] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [view, setView] = useState("list"); // list | new | thread
  const [thread, setThread] = useState(null);
  const [form, setForm] = useState({ name: "", order_number: "", message: "" });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = locale === "en" ? "/login" : `/${locale}/login`;
        return;
      }
      setSession(session);
      await loadList();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    const d = await (await fetch("/api/support/tickets")).json();
    if (d.success) setTickets(d.tickets);
    else {
      setTickets([]);
      setError(ERR[d.error] || t("Couldn't load your tickets."));
    }
  }

  async function openThread(id) {
    setError("");
    const d = await (await fetch(`/api/support/tickets?id=${id}`)).json();
    if (d.success) {
      setThread(d);
      setReply("");
      setView("thread");
    } else setError(ERR[d.error] || t("Couldn't open that ticket."));
  }

  async function createTicket(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = await (
      await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
    ).json();
    setBusy(false);
    if (d.success) {
      setNotice(t("Ticket #{n} created. We'll reply here.", { n: d.ticket_number }));
      setForm({ name: form.name, order_number: "", message: "" });
      await loadList();
      await openThread(d.id);
    } else setError(ERR[d.error] || d.error);
  }

  async function sendReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    const d = await (
      await fetch("/api/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: thread.ticket.id, message: reply }),
      })
    ).json();
    setBusy(false);
    if (d.success) {
      await openThread(thread.ticket.id);
      loadList();
    } else setError(ERR[d.error] || d.error);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={t("Support")} path="/account/support" noindex />
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />
      <main className="flex-1">
        <PageContainer className="py-10" width="max-w-2xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-ink">{t("Support")}</h1>
              <p className="mt-1 text-sm text-muted">{t("Write to us and we'll reply here. Mention your order number if it's about an order.")}</p>
            </div>
            {view !== "new" && (
              <PrimaryButton onClick={() => { setView("new"); setError(""); setNotice(""); }}>{t("New ticket")}</PrimaryButton>
            )}
          </div>

          {notice && <Alert variant="success" className="mb-4">{notice}</Alert>}
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          {view === "new" && (
            <form onSubmit={createTicket} className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
              <FormInput
                label={t("Your name")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={60}
                required
              />
              <FormInput
                label={t("Order number (optional)")}
                value={form.order_number}
                onChange={(e) => setForm({ ...form, order_number: e.target.value.replace(/\D/g, "") })}
                placeholder={t("e.g. 1042 — find it under My orders")}
                inputMode="numeric"
              />
              <label className="block text-sm font-medium text-ink">
                {t("Message")}
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={6}
                  maxLength={2000}
                  required
                  placeholder={t("Tell us what happened…")}
                  className="mt-1 w-full rounded-lg border border-border bg-bg p-3 text-sm text-ink"
                />
              </label>
              <p className="text-xs text-muted">{t("Never write passwords or card details here.")}</p>
              <div className="flex gap-2">
                <PrimaryButton type="submit" disabled={busy || form.name.trim().length < 2 || form.message.trim().length < 5}>
                  {busy ? t("Sending…") : t("Send")}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => setView("list")}>{t("Cancel")}</SecondaryButton>
              </div>
            </form>
          )}

          {view === "thread" && thread && (
            <div className="space-y-4">
              <button type="button" onClick={() => { setView("list"); setNotice(""); }} className="text-sm text-brand hover:underline">
                {locale === "ar" ? "→" : "←"} {t("All tickets")}
              </button>
              <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-lg font-semibold">{t("Ticket #{n}", { n: thread.ticket.ticket_number })}</div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[thread.ticket.status]}`}>
                    {LABEL[thread.ticket.status]}
                  </span>
                </div>
                {thread.ticket.order_number && (
                  <div className="text-xs text-muted">{t("About order #{n}", { n: thread.ticket.order_number })}</div>
                )}
                <div className="mt-4 space-y-3">
                  {thread.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[90%] rounded-xl px-4 py-2.5 text-sm ${
                        m.sender === "admin" ? "bg-brand-soft text-ink" : "ms-auto bg-brand text-white"
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`mt-1 text-[11px] ${m.sender === "admin" ? "text-muted" : "text-white/70"}`}>
                        {m.sender === "admin" ? t("Support") : t("You")} · {when(m.created_at, locale)}
                      </div>
                    </div>
                  ))}
                </div>
                {thread.ticket.status !== "closed" ? (
                  <form onSubmit={sendReply} className="mt-4 space-y-2">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={t("Write a reply…")}
                      className="w-full rounded-lg border border-border bg-bg p-3 text-sm text-ink"
                    />
                    <PrimaryButton type="submit" disabled={busy || !reply.trim()}>
                      {busy ? t("Sending…") : t("Send reply")}
                    </PrimaryButton>
                  </form>
                ) : (
                  <p className="mt-4 text-sm text-muted">{t("This ticket is closed. Open a new ticket if you still need help.")}</p>
                )}
              </div>
            </div>
          )}

          {view === "list" && (
            <>
              {tickets === null && <LoadingState label={t("Loading your tickets…")} />}
              {tickets && tickets.length === 0 && (
                <EmptyState title={t("No tickets yet")} description={t("Press “New ticket” if you need help.")} />
              )}
              <ul className="space-y-2">
                {(tickets || []).map((tk) => (
                  <li key={tk.id}>
                    <button
                      onClick={() => openThread(tk.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-start shadow-card hover:border-brand/40"
                    >
                      <span>
                        <span className="font-mono text-sm font-semibold">#{tk.ticket_number}</span>{" "}
                        <span className="text-sm text-muted">{when(tk.updated_at, locale)}</span>
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tk.status]}`}>{LABEL[tk.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
