import SEO from "../SEO";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "stats", label: "Statistics" },
  { id: "products", label: "Products" },
  { id: "manual", label: "Manual Products" },
  { id: "orders", label: "Orders" },
  { id: "deposits", label: "Deposits" },
  { id: "coupons", label: "Coupons" },
  { id: "feedback", label: "Feedback" },
  { id: "debug", label: "Debug payment" },
  { id: "settings", label: "Settings" },
];

export default function AdminLayout({ tab, onTabChange, dashboard, pendingManualCount, children }) {
  return (
    <div className="min-h-screen bg-bg font-body text-ink">
      <SEO title="Admin" path="/admin" noindex />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-lg font-semibold text-ink">DigiVerse 🌌 — Admin</span>
            {dashboard && (
              <div
                className={`flex flex-wrap gap-4 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  dashboard.digitrust.low ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"
                }`}
              >
                <span>
                  DigiTrust balance:{" "}
                  {dashboard.digitrust.error
                    ? "unavailable"
                    : `$${Number(dashboard.digitrust.balance).toFixed(2)}`}
                  {dashboard.digitrust.low && " — LOW, top up soon"}
                </span>
                <span>
                  Last sync:{" "}
                  {dashboard.lastSync ? new Date(dashboard.lastSync).toLocaleString() : "never"}
                </span>
              </div>
            )}
          </div>

          <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Admin sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-brand-soft hover:text-ink"
                }`}
              >
                {t.label}
                {t.id === "orders" && pendingManualCount > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                      tab === t.id ? "bg-white/20" : "bg-danger-soft text-danger"
                    }`}
                  >
                    {pendingManualCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
