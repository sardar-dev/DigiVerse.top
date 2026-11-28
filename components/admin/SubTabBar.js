/**
 * Shared segmented sub-tab navigation bar used by merged admin hub views.
 */
export default function SubTabBar({ tabs, active, onChange }) {
  return (
    <div
      className="mb-6 inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-card"
      role="tablist"
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
              isActive
                ? "bg-brand text-white shadow-xs"
                : "text-muted hover:bg-brand-soft/60 hover:text-ink"
            }`}
          >
            {t.icon && <span aria-hidden="true">{t.icon}</span>}
            <span>{t.label}</span>
            {t.badge > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold ${
                  isActive ? "bg-white/25 text-white" : "bg-danger text-white"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

