import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Alert from "../../components/ui/Alert";
import { LoadingState } from "../../components/ui/States";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Button";
import { useT, intlLocale } from "../../lib/i18n";

const when = (d, locale) =>
  new Date(d).toLocaleDateString(intlLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const BADGE_STYLES = {
  open: "bg-warning-soft text-warning border-warning/30",
  answered: "bg-success-soft text-success border-success/30",
  closed: "bg-border/60 text-muted border-border",
};

export default function Support() {
  const { t, locale } = useT();

  const STATUS_LABEL = useMemo(
    () => ({
      open: t("Waiting for us"),
      answered: t("We replied"),
      closed: t("Closed"),
    }),
    [t]
  );

  const ERR = useMemo(
    () => ({
      name_required: t("Please enter your name."),
      message_required: t("Please write a message (at least a few words)."),
      message_too_long: t("That message is too long (2000 characters max)."),
      invalid_order_number: t("Order number must be a number, like 1042."),
      too_many_open: t("You already have 3 open tickets. Please wait for a reply or close one first."),
      too_many_today: t("You've opened several tickets today. Please add to an existing one."),
      ticket_closed: t("This ticket is closed. Please open a new one."),
      thread_full: t("This ticket has reached its message limit. Please open a new one."),
      run_migration_019: t("Support isn't set up yet. Please try again later."),
    }),
    [t]
  );

  const [session, setSession] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [view, setView] = useState("list"); // "list" | "new" | "thread"
  const [thread, setThread] = useState(null);
  const [form, setForm] = useState({ name: "", order_number: "", message: "" });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [telegramLink, setTelegramLink] = useState("https://t.me/digiverse_top");
  const [openFaq, setOpenFaq] = useState(null);

  // Initialize Auth & Data
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

      // Pre-fill name from session metadata or email handle
      const defaultName =
        session.user?.user_metadata?.full_name ||
        session.user?.email?.split("@")[0] ||
        "";
      setForm((prev) => ({ ...prev, name: prev.name || defaultName }));

      await Promise.all([loadTickets(), loadRecentOrders(), loadSettings()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const d = await res.json();
      if (d?.channel_type === "telegram" && d?.whatsapp_link) {
        setTelegramLink(d.whatsapp_link);
      } else if (d?.telegram_channel_link) {
        setTelegramLink(d.telegram_channel_link);
      }
    } catch {
      // Fallback to default
    }
  }

  async function loadTickets() {
    try {
      const res = await fetch("/api/support/tickets");
      const d = await res.json();
      if (d.success) {
        setTickets(d.tickets);
      } else {
        setTickets([]);
        setError(ERR[d.error] || t("Couldn't load your tickets."));
      }
    } catch {
      setTickets([]);
      setError(t("Couldn't load your tickets."));
    }
  }

  async function loadRecentOrders() {
    try {
      const { data } = await supabase
        .from("orders")
        .select("id, created_at, total_amount, status, products(title)")
        .order("created_at", { ascending: false })
        .limit(6);
      setRecentOrders(data || []);
    } catch {
      setRecentOrders([]);
    }
  }

  async function openThread(id) {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/support/tickets?id=${id}`);
      const d = await res.json();
      if (d.success) {
        setThread(d);
        setReply("");
        setView("thread");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(ERR[d.error] || t("Couldn't open that ticket."));
      }
    } catch {
      setError(t("Couldn't open that ticket."));
    }
  }

  async function createTicket(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      setBusy(false);
      if (d.success) {
        setNotice(t("Ticket #{n} created. We'll reply here.", { n: d.ticket_number }));
        setForm((prev) => ({ ...prev, order_number: "", message: "" }));
        await loadTickets();
        await openThread(d.id);
      } else {
        setError(ERR[d.error] || d.error);
      }
    } catch {
      setBusy(false);
      setError(t("Failed to create ticket. Please try again."));
    }
  }

  async function sendReply(e) {
    if (e) e.preventDefault();
    if (!reply.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: thread.ticket.id, message: reply }),
      });
      const d = await res.json();
      setBusy(false);
      if (d.success) {
        setReply("");
        await openThread(thread.ticket.id);
        loadTickets();
      } else {
        setError(ERR[d.error] || d.error);
      }
    } catch {
      setBusy(false);
      setError(t("Failed to send reply."));
    }
  }

  // Quick action: start new ticket prefilled with order
  function startTicketForOrder(orderId) {
    setForm((prev) => ({ ...prev, order_number: String(orderId) }));
    setView("new");
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const openTicketsCount = (tickets || []).filter((t) => t.status !== "closed").length;

  const faqs = [
    {
      q: t("Where do I find my delivered license keys or accounts?"),
      a: t("All claimed stock license keys and account details are displayed immediately under your My Orders tab as soon as your payment confirms."),
      link: "/account/orders",
      linkLabel: t("Go to My Orders →"),
    },
    {
      q: t("What if my key or account is invalid or not working?"),
      a: t("Every product on DigiVerse includes a 100% Replacement Warranty. If any issue occurs, simply submit a ticket with your order number or message us on Telegram for an instant replacement."),
    },
    {
      q: t("How are Muse AI / Buff tokens delivered?"),
      a: t("Muse AI tokens are delivered asynchronously to your account via your invite code. You can monitor the real-time fulfillment status directly from your order history."),
    },
    {
      q: t("I sent crypto but my order still shows awaiting payment?"),
      a: t("Blockchain transactions typically confirm within 30–90 seconds. If your on-chain transfer has confirmed but the order has not updated, click 'Confirm Payment' on your order or send your transaction hash to support."),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={t("Customer Support Desk")} path="/account/support" noindex />
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1 py-8 sm:py-12">
        <PageContainer width="max-w-6xl">
          {/* ── Top Concierge Hero Banner ── */}
          <div className="relative mb-8 overflow-hidden rounded-3xl border border-border/80 bg-surface p-6 sm:p-8 shadow-card">
            {/* Subtle brand glow in background */}
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/10 blur-3xl sm:h-80 sm:w-80"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl"
              aria-hidden="true"
            />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl space-y-3">
                {/* Live Agents Online Pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span>{t("Live Support Online")}</span>
                  <span className="text-emerald-500/40">•</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {t("Avg response: < 15 mins")}
                  </span>
                </div>

                <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl lg:text-4xl">
                  {t("Customer Support Desk")}
                </h1>
                <p className="text-sm sm:text-base leading-relaxed text-muted">
                  {t("Need help with an order, license activation, or balance top-up? Open a ticket below or chat directly with our live agents on Telegram.")}
                </p>

                {/* Trust Badges */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <span>🛡️</span>
                    <span>{t("100% Replacement Warranty")}</span>
                  </span>
                  <span className="text-border" aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <span>⚡</span>
                    <span>{t("Zero-Friction Resolution")}</span>
                  </span>
                  <span className="text-border" aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <span>🔒</span>
                    <span>{t("Encrypted & Private")}</span>
                  </span>
                </div>
              </div>

              {/* Fast Lane Telegram Button on Desktop */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] hover:bg-[#1e8ec3] px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-95"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.5 1.9 12c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.6.2 1.5 1.2z" />
                  </svg>
                  <span>{t("Chat on Telegram (Instant)")}</span>
                </a>
              </div>
            </div>
          </div>

          {/* ── Status Notices ── */}
          {notice && <Alert variant="success" className="mb-6">{notice}</Alert>}
          {error && <Alert variant="error" className="mb-6">{error}</Alert>}

          {/* ── Main Two-Column Layout ── */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-8">
            {/* ── Left / Main Content Column (8 cols) ── */}
            <div className="space-y-6 lg:col-span-8">
              {/* Segmented View Switcher (when not in thread view) */}
              {view !== "thread" && (
                <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setView("list");
                        setError("");
                      }}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                        view === "list"
                          ? "bg-brand text-white shadow-xs"
                          : "border border-border/80 bg-surface text-muted hover:text-ink hover:border-brand-light"
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      <span>{t("My Tickets")}</span>
                      {tickets && tickets.length > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            view === "list" ? "bg-white/20 text-white" : "bg-bg text-muted"
                          }`}
                        >
                          {tickets.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setView("new");
                        setError("");
                      }}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                        view === "new"
                          ? "bg-brand text-white shadow-xs"
                          : "border border-border/80 bg-surface text-muted hover:text-ink hover:border-brand-light"
                      }`}
                    >
                      <span>➕</span>
                      <span>{t("Open New Ticket")}</span>
                    </button>
                  </div>

                  {openTicketsCount > 0 && (
                    <span className="hidden sm:inline-flex text-xs text-muted">
                      <strong className="text-ink font-semibold">{openTicketsCount}</strong>&nbsp;{t("open ticket(s)")}
                    </span>
                  )}
                </div>
              )}

              {/* ── View: Open New Ticket ── */}
              {view === "new" && (
                <div className="rounded-2xl border border-border/80 bg-surface p-6 sm:p-7 shadow-card">
                  <div className="mb-5 flex items-center justify-between border-b border-border/80 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-ink">{t("Open a Support Ticket")}</h2>
                      <p className="text-xs text-muted mt-0.5">
                        {t("Describe your issue and we'll reply directly in your dashboard.")}
                      </p>
                    </div>
                    {tickets && tickets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setView("list")}
                        className="text-xs font-semibold text-muted hover:text-ink transition-colors"
                      >
                        ✕ {t("Cancel")}
                      </button>
                    )}
                  </div>

                  <form onSubmit={createTicket} className="space-y-5">
                    {/* Your Name */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                        {t("Your Name")} <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        maxLength={60}
                        required
                        placeholder={t("Enter your name")}
                        className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                      />
                    </div>

                    {/* Order selector / Quick reference */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted">
                          {t("Related Order Number")} <span className="text-muted/60 font-normal">({t("Optional")})</span>
                        </label>
                        {form.order_number && (
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, order_number: "" })}
                            className="text-[11px] font-semibold text-muted hover:text-danger"
                          >
                            {t("Clear order")}
                          </button>
                        )}
                      </div>

                      {/* Quick chips of recent orders */}
                      {recentOrders.length > 0 && (
                        <div className="mb-2.5 flex flex-wrap gap-1.5">
                          {recentOrders.map((ro) => {
                            const isSelected = form.order_number === String(ro.id);
                            return (
                              <button
                                key={ro.id}
                                type="button"
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    order_number: isSelected ? "" : String(ro.id),
                                  })
                                }
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition active:scale-95 ${
                                  isSelected
                                    ? "bg-brand text-white shadow-2xs"
                                    : "border border-border/80 bg-surface text-ink hover:border-brand-light hover:bg-brand-soft/40"
                                }`}
                              >
                                <span className="font-mono font-bold">#{ro.id}</span>
                                <span className="truncate max-w-[140px] text-[11px] opacity-80">
                                  {ro.products?.title || t("Product")}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.order_number}
                        onChange={(e) =>
                          setForm({ ...form, order_number: e.target.value.replace(/\D/g, "") })
                        }
                        placeholder={t("e.g. 1042 — or pick from recent orders above")}
                        className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm font-mono text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                      />
                    </div>

                    {/* Message Body */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted">
                          {t("Message")} <span className="text-danger">*</span>
                        </label>
                        <span className="text-[11px] font-mono text-muted">
                          {form.message.length} / 2000
                        </span>
                      </div>
                      <textarea
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        rows={6}
                        maxLength={2000}
                        required
                        placeholder={t("Describe what happened in detail. We review all tickets promptly…")}
                        className="w-full rounded-xl border border-border bg-bg p-3.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition leading-relaxed"
                      />
                      <p className="mt-1.5 text-xs text-muted flex items-center gap-1.5">
                        <span>🔒</span>
                        <span>{t("Security note: Never write passwords or credit card details here.")}</span>
                      </p>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center gap-3 pt-2">
                      <PrimaryButton
                        type="submit"
                        disabled={
                          busy ||
                          form.name.trim().length < 2 ||
                          form.message.trim().length < 5
                        }
                        className="px-6 py-2.5 text-sm font-semibold"
                      >
                        {busy ? t("Sending…") : t("Submit Ticket")}
                      </PrimaryButton>
                      {tickets && tickets.length > 0 && (
                        <SecondaryButton type="button" onClick={() => setView("list")}>
                          {t("Cancel")}
                        </SecondaryButton>
                      )}
                    </div>
                  </form>
                </div>
              )}

              {/* ── View: Ticket Thread ── */}
              {view === "thread" && thread && (
                <div className="space-y-4">
                  {/* Breadcrumb / Back button */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setView("list");
                        setNotice("");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-brand hover:text-brand-dark transition-colors"
                    >
                      <span>{locale === "ar" ? "→" : "←"}</span>
                      <span>{t("Back to all tickets")}</span>
                    </button>

                    <span
                      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold border ${
                        BADGE_STYLES[thread.ticket.status] || BADGE_STYLES.open
                      }`}
                    >
                      {STATUS_LABEL[thread.ticket.status] || thread.ticket.status}
                    </span>
                  </div>

                  {/* Thread Main Box */}
                  <div className="rounded-2xl border border-border/80 bg-surface shadow-card overflow-hidden">
                    {/* Header */}
                    <div className="border-b border-border/80 bg-bg/40 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-ink">
                            {t("Ticket #{n}", { n: thread.ticket.ticket_number })}
                          </h2>
                          <span className="text-muted text-xs">•</span>
                          <span className="text-xs text-muted">
                            {t("Created by {name}", { name: thread.ticket.name })}
                          </span>
                        </div>
                        {thread.ticket.order_number && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                            <span>{t("About Order:")}</span>
                            <Link
                              href="/account/orders"
                              className="font-mono font-bold text-brand hover:underline"
                            >
                              #{thread.ticket.order_number}
                            </Link>
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-muted">
                        {t("Last active:")} <span className="font-medium text-ink">{when(thread.ticket.updated_at, locale)}</span>
                      </div>
                    </div>

                    {/* Messages Flow */}
                    <div className="p-5 sm:p-6 space-y-4 max-h-[600px] overflow-y-auto">
                      {thread.messages.map((m) => {
                        const isAdmin = m.sender === "admin";
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${isAdmin ? "items-start" : "items-end"}`}
                          >
                            <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-muted">
                              <span className="font-semibold text-ink">
                                {isAdmin ? `🛡️ ${t("DigiVerse Support")}` : t("You")}
                              </span>
                              <span>·</span>
                              <span>{when(m.created_at, locale)}</span>
                            </div>

                            <div
                              className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                                isAdmin
                                  ? "rounded-tl-xs border border-border/80 bg-bg text-ink"
                                  : "rounded-tr-xs bg-brand text-white"
                              }`}
                            >
                              <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Input or Closed Notice */}
                    <div className="border-t border-border/80 bg-bg/20 p-5 sm:p-6">
                      {thread.ticket.status !== "closed" ? (
                        <form onSubmit={sendReply} className="space-y-3">
                          <div className="relative">
                            <textarea
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                  sendReply();
                                }
                              }}
                              rows={3}
                              maxLength={2000}
                              placeholder={t("Type your reply here… (Ctrl + Enter to send)")}
                              className="w-full rounded-xl border border-border bg-surface p-3.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition leading-relaxed shadow-2xs"
                            />
                            <div className="absolute bottom-2.5 end-3 text-[10px] font-mono text-muted/70">
                              {reply.length} / 2000
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-[11px] text-muted hidden sm:inline">
                              {t("Tip: Press Ctrl + Enter to send instantly.")}
                            </span>
                            <PrimaryButton
                              type="submit"
                              disabled={busy || !reply.trim()}
                              className="px-5 py-2 text-xs sm:text-sm font-semibold min-h-10"
                            >
                              {busy ? t("Sending…") : t("Send reply")}
                            </PrimaryButton>
                          </div>
                        </form>
                      ) : (
                        <div className="rounded-xl border border-border/80 bg-surface p-4 text-center text-xs text-muted">
                          {t("This ticket has been marked as resolved and closed. If you need further assistance, please open a new ticket.")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── View: Ticket List ── */}
              {view === "list" && (
                <>
                  {tickets === null ? (
                    <LoadingState label={t("Loading your tickets…")} />
                  ) : tickets.length === 0 ? (
                    <div className="rounded-2xl border border-border/80 bg-surface p-8 text-center shadow-card space-y-4">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-2xl text-brand">
                        💬
                      </div>
                      <div className="max-w-md mx-auto space-y-1.5">
                        <h3 className="text-base font-bold text-ink">{t("No support tickets yet")}</h3>
                        <p className="text-xs text-muted leading-relaxed">
                          {t("Have a question about a product, token delivery, or order? We're here to assist you.")}
                        </p>
                      </div>
                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <PrimaryButton
                          onClick={() => {
                            setView("new");
                            setError("");
                          }}
                          className="w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-semibold"
                        >
                          {t("Open Your First Ticket")}
                        </PrimaryButton>
                        <a
                          href={telegramLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg/50 px-5 py-2.5 text-xs sm:text-sm font-semibold text-ink hover:border-brand-light transition"
                        >
                          <span>{t("Message on Telegram")}</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tickets.map((tk) => {
                        const isAnswered = tk.status === "answered";
                        return (
                          <button
                            key={tk.id}
                            type="button"
                            onClick={() => openThread(tk.id)}
                            className={`group flex w-full flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-surface p-4 text-start shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${
                              isAnswered ? "border-brand/40 ring-1 ring-brand/10" : "border-border/80 hover:border-brand-light"
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-mono text-sm font-bold text-ink group-hover:text-brand transition-colors">
                                  #{tk.ticket_number}
                                </span>
                                <span className="text-xs text-muted">
                                  {t("Created by {name}", { name: tk.name })}
                                </span>
                                {tk.order_number && (
                                  <span className="rounded bg-bg border border-border/70 px-2 py-0.5 text-[11px] font-mono text-ink">
                                    {t("Order")} #{tk.order_number}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted">
                                {t("Last activity:")} <span className="font-medium text-ink">{when(tk.updated_at, locale)}</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/60">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                                  BADGE_STYLES[tk.status] || BADGE_STYLES.open
                                }`}
                              >
                                {STATUS_LABEL[tk.status] || tk.status}
                              </span>
                              <span className="text-muted group-hover:text-brand transition-colors text-sm">
                                →
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Right Column: Smart Sidebar Widgets (4 cols) ── */}
            <div className="space-y-6 lg:col-span-4">
              {/* Widget 1: Telegram Fast-Lane */}
              <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-card space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#229ED9]/10 text-[#229ED9]">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                      <path d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.5 1.9 12c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.6.2 1.5 1.2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">{t("Need Instant Help?")}</h3>
                    <p className="text-[11px] text-muted">{t("Connect directly with an agent")}</p>
                  </div>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  {t("For urgent delivery questions, payment matching, or real-time assistance, message our official Telegram support desk.")}
                </p>

                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-soft border border-brand/20 px-4 py-2.5 text-xs font-bold text-brand transition hover:bg-brand hover:text-white"
                >
                  <span>{t("Open Telegram Chat")}</span>
                  <span>↗</span>
                </a>
              </div>

              {/* Widget 2: Recent Orders Quick-Selector */}
              {recentOrders.length > 0 && (
                <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-card space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                      {t("Your Recent Orders")}
                    </h3>
                    <Link
                      href="/account/orders"
                      className="text-[11px] font-semibold text-brand hover:underline"
                    >
                      {t("View all")}
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {recentOrders.slice(0, 3).map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-bg/50 p-2.5 text-xs transition-colors hover:border-brand-light"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-ink">
                            <span className="font-mono">#{o.id}</span>
                            <span className="text-border">•</span>
                            <span className="font-mono font-normal text-muted">${Number(o.total_amount).toFixed(2)}</span>
                          </div>
                          <div className="truncate text-[11px] text-muted">
                            {o.products?.title || t("Product")}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => startTicketForOrder(o.id)}
                          className="flex-shrink-0 rounded-lg bg-surface border border-border px-2 py-1 text-[11px] font-semibold text-brand hover:bg-brand-soft hover:border-brand-light transition"
                        >
                          {t("Help")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Widget 3: Instant Answers FAQ Accordion */}
              <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-card space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <h3 className="text-sm font-bold text-ink">{t("Quick Self-Help Answers")}</h3>
                </div>

                <div className="divide-y divide-border/60">
                  {faqs.map((f, i) => {
                    const isOpen = openFaq === i;
                    return (
                      <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => setOpenFaq(isOpen ? null : i)}
                          className="flex w-full items-start justify-between gap-2 text-start text-xs font-semibold text-ink hover:text-brand transition-colors"
                        >
                          <span>{f.q}</span>
                          <span className="font-mono text-muted text-xs flex-shrink-0">
                            {isOpen ? "−" : "+"}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="mt-2 text-xs leading-relaxed text-muted space-y-1.5">
                            <p>{f.a}</p>
                            {f.link && (
                              <Link
                                href={f.link}
                                className="inline-block font-semibold text-brand hover:underline"
                              >
                                {f.linkLabel}
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}
