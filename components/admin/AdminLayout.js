import SEO from "../SEO";

// Sidebar groups on desktop; the same items become a scrollable chip bar
// on phones. `id`s double as the URL hash (#orders) so refresh keeps
// the open page.
const GROUPS = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "📊" },
      { id: "stats", label: "Statistics", icon: "📈" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { id: "products", label: "Products", icon: "🛍️" },
      { id: "manual", label: "Manual products", icon: "✍️" },
      { id: "suppliers", label: "Suppliers", icon: "🔗" },
      { id: "apis", label: "API connections", icon: "🔌" },
      { id: "pricing", label: "Pricing & profit", icon: "💰" },
      { id: "aitext", label: "AI text", icon: "✨" },
    ],
  },
  {
    label: "Sales",
    items: [
      { id: "orders", label: "Orders", icon: "📦" },
      { id: "deposits", label: "Deposits", icon: "💳" },
      { id: "coupons", label: "Coupons", icon: "🎟️" },
      { id: "withdrawals", label: "Withdrawals", icon: "💸" },
    ],
  },
  {
    label: "Support & tools",
    items: [
      { id: "support", label: "Support", icon: "🎧" },
      { id: "feedback", label: "Feedback", icon: "💬" },
      { id: "debug", label: "Debug payment", icon: "🛠️" },
      { id: "settings", label: "Settings", icon: "⚙️" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
export const ADMIN_TAB_IDS = ALL.map((t) => t.id);

export default function AdminLayout({ tab, onTabChange, dashboard, pendingManualCount, children }) {
  const badge = (id) =>
    id === "orders" && pendingManualCount > 0
      ? pendingManualCount
      : id === "support" && dashboard?.openTickets > 0
      ? dashboard.openTickets
      : id === "withdrawals" && dashboard?.pendingWithdrawals > 0
      ? dashboard.pendingWithdrawals
      : 0;
  const low = dashboard && (dashboard.digitrust?.low || dashboard.xpro?.low);

  return (
    <div className="min-h-screen bg-bg font-body text-ink">
      <SEO title="Admin" path="/admin" noindex />

      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-2.5" aria-label="Open storefront">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-light to-brand-dark text-white shadow-card">
              ✦
            </span>
            <span className="text-base font-semibold tracking-tight text-ink">
              DigiVerse <span className="font-normal text-muted">Admin</span>
            </span>
          </a>
          {dashboard && (
            <div
              className={`flex flex-wrap gap-x-4 gap-y-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                low ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"
              }`}
            >
              <span>
                DigiTrust:{" "}
                {dashboard.digitrust.error ? "unavailable" : `$${Number(dashboard.digitrust.balance).toFixed(2)}`}
                {dashboard.digitrust.low && " — LOW"}
              </span>
              {dashboard.xpro && (
                <span>
                  XPro:{" "}
                  {dashboard.xpro.error || dashboard.xpro.balance === null
                    ? "unavailable"
                    : `$${Number(dashboard.xpro.balance).toFixed(2)}`}
                  {dashboard.xpro.low && " — LOW"}
                </span>
              )}
              <span>Synced: {dashboard.lastSync ? new Date(dashboard.lastSync).toLocaleString() : "never"}</span>
            </div>
          )}
        </div>

        {/* Phones / small screens: one scrollable row of chips */}
        <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden" aria-label="Admin sections">
          {ALL.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-muted hover:text-ink"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
              {badge(t.id) > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-xs text-white">{badge(t.id)}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-5" aria-label="Admin sections">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {g.label}
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => onTabChange(t.id)}
                        aria-current={tab === t.id ? "page" : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                          tab === t.id
                            ? "bg-brand text-white shadow-card"
                            : "text-ink hover:bg-brand-soft"
                        }`}
                      >
                        <span aria-hidden="true" className="w-5 text-center">
                          {t.icon}
                        </span>
                        <span className="flex-1">{t.label}</span>
                        {badge(t.id) > 0 && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-xs ${
                              tab === t.id ? "bg-white/25" : "bg-danger text-white"
                            }`}
                          >
                            {badge(t.id)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
