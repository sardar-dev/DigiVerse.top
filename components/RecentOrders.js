import { useEffect, useState } from "react";
import PageContainer from "./layout/PageContainer";
import { useT } from "../lib/i18n";

const AVATAR_PALETTES = [
  { gradient: "from-blue-500 to-indigo-600" },
  { gradient: "from-emerald-500 to-teal-600" },
  { gradient: "from-purple-500 to-pink-600" },
  { gradient: "from-amber-500 to-orange-600" },
  { gradient: "from-cyan-500 to-blue-600" },
  { gradient: "from-rose-500 to-red-600" },
  { gradient: "from-violet-500 to-purple-700" },
  { gradient: "from-teal-500 to-emerald-700" },
];

function getAvatarStyle(email = "") {
  const clean = String(email).trim();
  const firstLetter = (clean[0] || "U").toUpperCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  return { char: firstLetter, gradient: palette.gradient };
}

function cleanProductTitle(str) {
  if (!str) return "";
  return String(str)
    .replace(/\bbuff\s*tokens?\b/gi, "Muse AI Tokens")
    .replace(/\bbuff\b/gi, "Tokens")
    .replace(/\s+/g, " ")
    .trim();
}

function ago(iso, t) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.floor(s / 3600) });
  return t("{n} d ago", { n: Math.floor(s / 86400) });
}

// Public social-proof feed: verified recent customer deliveries.
// Fetched after first paint so it never blocks page load or SSR.
export default function RecentOrders() {
  const { t } = useT();
  const [orders, setOrders] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let off = false;
    fetch("/api/recent-orders")
      .then((r) => r.json())
      .then((d) => !off && setOrders(d.success ? d.orders : []))
      .catch(() => !off && setOrders([]));
    return () => {
      off = true;
    };
  }, []);

  if (!orders || orders.length === 0) return null;

  const INITIAL_COUNT = 8;
  const visibleOrders = expanded ? orders : orders.slice(0, INITIAL_COUNT);
  const hasMore = orders.length > INITIAL_COUNT;

  return (
    <section
      className="border-t border-border bg-gradient-to-b from-surface via-bg/30 to-surface py-12 sm:py-16"
      aria-labelledby="recent-orders-title"
    >
      <PageContainer>
        {/* Section Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shadow-xs">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="tracking-wide uppercase text-[10px] sm:text-xs font-bold">
              {t("Live Activity Feed")}
            </span>
          </div>

          <h2 id="recent-orders-title" className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {t("Recent orders")}
          </h2>

          <p className="mx-auto max-w-lg text-xs sm:text-sm text-muted leading-relaxed">
            {t("Real purchases from our customers, delivered instantly.")}
          </p>

          {/* Trust Metrics Bar */}
          <div className="pt-1 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 shadow-xs">
              <span className="text-emerald-500">⚡</span>
              <span>{t("Instant Delivery")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 shadow-xs">
              <span className="text-brand">🛡️</span>
              <span>{t("Verified Purchases")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 shadow-xs">
              <span className="text-purple-500">🌍</span>
              <span>{t("Global Customers")}</span>
            </span>
          </div>
        </div>

        {/* 2-Column Responsive Activity Grid */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:gap-3.5 md:grid-cols-2">
          {visibleOrders.map((o) => {
            const avatar = getAvatarStyle(o.email_masked);
            const cleanTitle = cleanProductTitle(o.product_title);

            return (
              <div
                key={o.id}
                className="group relative flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 sm:p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-light hover:shadow-card-hover"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Customer Avatar with Initial & Verified Dot */}
                  <div className="relative flex-shrink-0">
                    <div
                      className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br ${avatar.gradient} font-mono font-bold text-white text-sm shadow-xs transition-transform duration-200 group-hover:scale-105`}
                      aria-hidden="true"
                    >
                      {avatar.char}
                    </div>
                    <span
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-surface text-[9px] font-bold shadow-xs"
                      title={t("Verified Delivery")}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  </div>

                  {/* Order Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-ink truncate" dir="ltr">
                        {o.email_masked}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t("Delivered")}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted truncate">
                      <span className="inline-flex items-center justify-center rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand border border-brand/20 flex-shrink-0">
                        {o.quantity}x
                      </span>
                      <span className="font-medium text-ink truncate group-hover:text-brand transition-colors">
                        {cleanTitle}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Relative Timestamp */}
                <div className="flex-shrink-0 text-right">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-bg px-2.5 py-1 font-mono text-[11px] font-medium text-muted border border-border">
                    <svg
                      className="h-3 w-3 text-muted/70 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{ago(o.created_at, t)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expand / Collapse Toggle Button */}
        {hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface hover:bg-bg hover:border-brand-light px-4 py-2.5 text-xs sm:text-sm font-semibold text-ink shadow-xs transition-all active:scale-[0.99]"
            >
              <span>
                {expanded
                  ? t("Show less")
                  : t("Show all recent orders ({n})", { n: orders.length })}
              </span>
              <svg
                className={`h-4 w-4 text-muted transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </PageContainer>
    </section>
  );
}
