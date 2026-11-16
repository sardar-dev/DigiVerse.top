import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import PaymentPanel from "../../components/PaymentPanel";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import StatusBadge from "../../components/ui/StatusBadge";
import { LoadingState } from "../../components/ui/States";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Button";
import DeliveredItems from "../../components/ui/DeliveredItems";
import { useT, intlLocale } from "../../lib/i18n";

const when = (d, locale) =>
  new Date(d).toLocaleDateString(intlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function Orders() {
  const { t, locale } = useT();

  const STATUS_LABEL = useMemo(
    () => ({
      pending_payment: t("Awaiting payment"),
      payment_submitted: t("Verifying payment"),
      paid: t("Paid — fulfilling"),
      fulfilling: t("Fulfilling"),
      awaiting_manual_fulfillment: t("Awaiting manual delivery"),
      needs_reconciliation: t("Confirming delivery"),
      delivered: t("Delivered"),
      failed: t("Failed — refund pending"),
      refunded: t("Refunded"),
      cancelled: t("Cancelled"),
    }),
    [t]
  );

  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState(null);
  const [resuming, setResuming] = useState(null); // order id being resumed
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "delivered" | "pending_payment" | "processing"
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = locale === "en" ? "/login" : `/${locale}/login`;
      return;
    }
    setSession(session);

    // Clean up expired unpaid orders in the background
    fetch("/api/orders/cleanup-expired", { method: "POST" }).catch(() => {});

    const { data } = await supabase
      .from("orders")
      .select("*, products(title, provider, delivery, image_url)")
      .order("created_at", { ascending: false })
      .limit(100);

    const now = Date.now();
    const activeOrders = (data || []).filter((o) => {
      if (o.status === "pending_payment") {
        const age = now - new Date(o.created_at).getTime();
        return age < 30 * 60 * 1000; // Exclude orders older than 30 minutes
      }
      return true;
    });

    setOrders(activeOrders);
  }

  // Auto-remove expired pending_payment orders in real time after 30 minutes
  useEffect(() => {
    if (!orders || orders.length === 0) return;
    const hasPending = orders.some((o) => o.status === "pending_payment");
    if (!hasPending) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const anyExpired = orders.some(
        (o) =>
          o.status === "pending_payment" &&
          now - new Date(o.created_at).getTime() >= 30 * 60 * 1000
      );
      if (anyExpired) {
        fetch("/api/orders/cleanup-expired", { method: "POST" }).catch(() => {});
        load();
      }
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Buff-token orders finish a minute or two after payment (TunVN credits the
  // invite code asynchronously). While one is open, ask the server to check.
  useEffect(() => {
    if (!orders) return;
    const waiting = orders.filter((o) => o.status === "fulfilling" && o.supplier === "tunvn");
    if (waiting.length === 0) return;
    let stop = false;
    async function tick() {
      let changed = false;
      for (const o of waiting) {
        try {
          const r = await fetch("/api/orders/buff-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: o.id }),
          });
          const d = await r.json().catch(() => ({}));
          if (d.state === "done" || d.state === "failed") changed = true;
        } catch {}
      }
      if (changed && !stop) load();
    }
    const first = setTimeout(tick, 4000);
    const iv = setInterval(tick, 15000);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  async function cancelOrder(id) {
    if (!window.confirm(t("Are you sure you want to cancel this order?"))) return;
    await fetch("/api/orders/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id }),
    });
    load();
  }

  async function handleCopyOrderNumber(orderNum, id) {
    try {
      await navigator.clipboard.writeText(String(orderNum));
      setCopiedOrderId(id);
      setTimeout(() => setCopiedOrderId(null), 2000);
    } catch {}
  }

  // Summary Metrics
  const stats = useMemo(() => {
    if (!orders) return { total: 0, delivered: 0, pending: 0, totalSpent: 0 };
    let delivered = 0;
    let pending = 0;
    let totalSpent = 0;
    for (const o of orders) {
      if (o.status === "delivered") {
        delivered++;
        totalSpent += Number(o.total || 0);
      } else if (o.status === "pending_payment") {
        pending++;
      }
    }
    return {
      total: orders.length,
      delivered,
      pending,
      totalSpent,
    };
  }, [orders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      // Status tab filter
      if (filterStatus === "delivered" && o.status !== "delivered") return false;
      if (filterStatus === "pending_payment" && o.status !== "pending_payment") return false;
      if (
        filterStatus === "processing" &&
        !["fulfilling", "paid", "payment_submitted", "awaiting_manual_fulfillment", "needs_reconciliation"].includes(
          o.status
        )
      ) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchNum = String(o.order_number || o.id).includes(q);
        const matchTitle = (o.products?.title || "").toLowerCase().includes(q);
        if (!matchNum && !matchTitle) return false;
      }
      return true;
    });
  }, [orders, filterStatus, searchQuery]);

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={t("My Orders & Digital Assets")} path="/account/orders" noindex />
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1 py-8 sm:py-12">
        <PageContainer width="max-w-5xl">
          {/* ── Top Hero Header & Order Overview ── */}
          <div className="relative mb-8 overflow-hidden rounded-3xl border border-border/80 bg-surface p-6 sm:p-8 shadow-card">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full bg-brand/10 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl"
              aria-hidden="true"
            />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span>{t("100% Replacement Warranty Active")}</span>
                </div>

                <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                  {t("My Orders & Digital Assets")}
                </h1>
                <p className="text-xs sm:text-sm text-muted max-w-xl leading-relaxed">
                  {t("View your claimed license keys, access codes, and track real-time fulfillment across all purchases.")}
                </p>
              </div>

              {/* Fast Help Link */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <Link
                  href="/account/support"
                  className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-surface px-4 py-2.5 text-xs sm:text-sm font-semibold text-ink shadow-2xs transition hover:border-brand-light hover:bg-brand-soft/40 active:scale-95"
                >
                  <span>💬</span>
                  <span>{t("Contact Support Desk")}</span>
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-dark px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-2xs transition active:scale-95"
                >
                  <span>⚡</span>
                  <span>{t("Browse Catalog")}</span>
                </Link>
              </div>
            </div>

            {/* Metrics Ribbon */}
            {orders && orders.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-border/80 pt-6">
                <div className="rounded-xl border border-border/60 bg-bg/50 p-3">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Total Orders")}</div>
                  <div className="mt-1 font-mono text-xl font-extrabold text-ink">{stats.total}</div>
                </div>

                <div className="rounded-xl border border-border/60 bg-bg/50 p-3">
                  <div className="text-[11px] font-semibold text-success uppercase tracking-wider">{t("Delivered Items")}</div>
                  <div className="mt-1 font-mono text-xl font-extrabold text-success">{stats.delivered}</div>
                </div>

                <div className="rounded-xl border border-border/60 bg-bg/50 p-3">
                  <div className="text-[11px] font-semibold text-warning uppercase tracking-wider">{t("Pending Action")}</div>
                  <div className="mt-1 font-mono text-xl font-extrabold text-warning">{stats.pending}</div>
                </div>

                <div className="rounded-xl border border-border/60 bg-bg/50 p-3">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Total Delivered Value")}</div>
                  <div className="mt-1 font-mono text-xl font-extrabold text-ink" dir="ltr">
                    ${stats.totalSpent.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Filter Tabs & Search Controls ── */}
          {orders && orders.length > 0 && (
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[
                  { id: "all", label: t("All Orders"), count: orders.length },
                  { id: "delivered", label: t("Delivered"), count: stats.delivered },
                  { id: "pending_payment", label: t("Awaiting Payment"), count: stats.pending },
                  {
                    id: "processing",
                    label: t("Processing"),
                    count: orders.filter((o) =>
                      ["fulfilling", "paid", "payment_submitted", "awaiting_manual_fulfillment"].includes(o.status)
                    ).length,
                  },
                ].map((tab) => {
                  const isActive = filterStatus === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterStatus(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition active:scale-95 flex-shrink-0 ${
                        isActive
                          ? "bg-brand text-white shadow-2xs"
                          : "border border-border/80 bg-surface text-muted hover:border-brand-light hover:text-ink"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isActive ? "bg-white/20 text-white" : "bg-bg text-muted border border-border/60"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative flex w-full sm:w-64 flex-shrink-0">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted" aria-hidden="true">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                </div>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Filter by #order or name…")}
                  className="w-full rounded-xl border border-border/90 bg-surface py-2 pe-7 ps-9 text-xs sm:text-sm text-ink placeholder:text-muted/60 shadow-2xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 end-0 flex items-center pe-2.5 text-muted hover:text-ink"
                    aria-label={t("Clear search")}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Order List / States ── */}
          {!orders && <LoadingState label={t("Loading your orders…")} />}

          {orders && orders.length === 0 && (
            <div className="rounded-3xl border border-border/80 bg-surface p-10 text-center shadow-card space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-3xl text-brand">
                📦
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-lg font-bold text-ink">{t("No orders placed yet")}</h3>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  {t("When you purchase digital subscriptions, software licenses, or AI tokens, your delivery and serial keys will appear here instantly.")}
                </p>
              </div>
              <div className="pt-2">
                <Link href="/">
                  <PrimaryButton className="px-6 py-2.5 text-sm font-semibold">
                    <span>⚡ {t("Browse Storefront Catalog")}</span>
                  </PrimaryButton>
                </Link>
              </div>
            </div>
          )}

          {orders && orders.length > 0 && filteredOrders.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted">
              {t("No orders match your selected filters.")}&nbsp;
              <button
                type="button"
                onClick={() => {
                  setFilterStatus("all");
                  setSearchQuery("");
                }}
                className="font-semibold text-brand hover:underline"
              >
                {t("Reset filters")}
              </button>
            </div>
          )}

          {/* ── Render Orders ── */}
          <div className="space-y-4">
            {filteredOrders.map((o) => {
              const isPending = o.status === "pending_payment";
              const isDelivered = o.status === "delivered";
              const isFulfilling = o.status === "fulfilling";
              const isResumingThis = resuming === o.id;
              const isCopied = copiedOrderId === o.id;

              return (
                <div
                  key={o.id}
                  className={`group rounded-2xl border bg-surface p-5 sm:p-6 shadow-card transition-all duration-200 ${
                    isPending
                      ? "border-amber-300/80 bg-amber-50/20"
                      : isDelivered
                      ? "border-border/80 hover:border-brand-light"
                      : "border-border/80"
                  }`}
                >
                  {/* Card Top: Avatar, Title, Order #, Total, Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Product Thumbnail / Avatar */}
                      {o.products?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={o.products.image_url}
                          alt=""
                          className="h-12 w-12 flex-shrink-0 rounded-xl border border-border/80 bg-bg p-0.5 object-cover shadow-2xs"
                        />
                      ) : (
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg font-bold text-brand shadow-2xs">
                          {(o.products?.title || "?").trim().charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-ink truncate max-w-sm sm:max-w-md">
                            {o.products?.title || t("Product #{id}", { id: o.product_id })}
                          </h3>
                          <span className="rounded-md bg-bg border border-border/80 px-2 py-0.5 text-xs font-semibold text-muted">
                            × {o.quantity}
                          </span>
                        </div>

                        {/* Order Metadata Row */}
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted">
                          {/* Order Number with One-Click Copy */}
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-bold text-ink">
                              #{o.order_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyOrderNumber(o.order_number, o.id)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand-soft transition"
                              title={t("Copy order number")}
                            >
                              {isCopied ? `✓ ${t("Copied")}` : t("Copy")}
                            </button>
                          </div>

                          <span className="text-border" aria-hidden="true">•</span>
                          <span>{when(o.created_at, locale)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Price and Status Badge */}
                    <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/60">
                      <div className="flex items-baseline gap-1" dir="ltr">
                        <span className="font-mono text-lg sm:text-xl font-extrabold text-ink">
                          ${Number(o.total).toFixed(2)}
                        </span>
                        <span className="text-[10px] font-semibold text-muted uppercase">USDT</span>
                      </div>
                      <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                    </div>
                  </div>

                  {/* ── Status-Specific Notification Callouts ── */}
                  {o.status === "awaiting_manual_fulfillment" && o.products?.delivery && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-xs text-warning">
                      <span>🕒</span>
                      <span>
                        <b>{t("Estimated delivery:")}</b> {o.products.delivery}
                      </span>
                    </div>
                  )}

                  {isFulfilling && o.supplier === "tunvn" && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-xs font-medium text-brand animate-pulse">
                      <span>⚡</span>
                      <span>{t("Crediting tokens to your invite code … this usually takes 10 to 15 minutes.")}</span>
                    </div>
                  )}

                  {/* ── Pending Payment Callout & Actions ── */}
                  {isPending && !isResumingThis && (
                    <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        <span className="font-semibold">⚠️ {t("Awaiting payment:")}</span>{" "}
                        {t("Send the exact deposit amount before this order expires.")}
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <PrimaryButton
                          onClick={() => setResuming(o.id)}
                          className="px-4 py-1.5 text-xs font-semibold shadow-xs"
                        >
                          {t("Continue payment →")}
                        </PrimaryButton>
                        <button
                          type="button"
                          onClick={() => cancelOrder(o.id)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft hover:border-danger/30 transition"
                        >
                          {t("Cancel order")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Expanded Payment Panel ── */}
                  {isPending && isResumingThis && (
                    <div className="mt-4 rounded-2xl border border-border bg-bg p-5 shadow-inner">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted">
                          {t("Complete Payment for Order #{n}", { n: o.order_number })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setResuming(null)}
                          className="rounded-lg p-1 text-xs font-semibold text-muted hover:text-ink"
                        >
                          ✕ {t("Close")}
                        </button>
                      </div>

                      <PaymentPanel
                        order={o}
                        onDone={() => {
                          setResuming(null);
                          load();
                        }}
                      />

                      <div className="mt-3 flex justify-end">
                        <SecondaryButton
                          onClick={() => setResuming(null)}
                          className="px-4 py-1.5 text-xs"
                        >
                          {t("Minimize panel")}
                        </SecondaryButton>
                      </div>
                    </div>
                  )}

                  {/* ── Delivered Content Area ── */}
                  {isDelivered && (Array.isArray(o.items) ? o.items.length > 0 : !!o.items) && (
                    <div className="mt-4 pt-4 border-t border-border/80">
                      <div className="mb-2 flex items-center">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
                          <span>✓</span>
                          <span>{t("Verified Delivery")}</span>
                        </span>
                      </div>
                      <DeliveredItems items={o.items} />
                    </div>
                  )}

                  {/* ── Card Footer Actions (Support & Repurchase) ── */}
                  <div className="mt-4 pt-3.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/account/support`}
                        className="inline-flex items-center gap-1 font-semibold text-muted hover:text-brand transition-colors"
                      >
                        <span>💬</span>
                        <span>{t("Need help with this order?")}</span>
                      </Link>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/?search=${encodeURIComponent(o.products?.title || "")}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        {t("Buy again")} →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}
