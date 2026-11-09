import StatCard from "./StatCard";

const SUPPLIER_NAMES = { digitrust: "DigiTrust", xpro: "XPro", emstore: "EM Store", shotix: "Shotix", tunvn: "TunVN" };
function supplierName(id) {
  return SUPPLIER_NAMES[id] || (id.startsWith("c_") ? id.slice(2).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : id);
}

const SUPPLIER_THEMES = {
  digitrust: { icon: "🏛", card: "border-blue-200 bg-gradient-to-br from-blue-50/70 to-white", circle: "from-blue-500 to-blue-600", text: "text-blue-600", tag: "bg-blue-100 text-blue-700" },
  xpro:      { icon: "★", card: "border-purple-200 bg-gradient-to-br from-purple-50/70 to-white", circle: "from-purple-500 to-indigo-600", text: "text-purple-600", tag: "bg-purple-100 text-purple-700" },
  emstore:   { icon: "🛒", card: "border-emerald-300 bg-gradient-to-br from-emerald-50/70 to-white", circle: "from-emerald-500 to-teal-600", text: "text-emerald-700", tag: "bg-emerald-100 text-emerald-700" },
  shotix:    { icon: "⚡", card: "border-amber-200 bg-gradient-to-br from-amber-50/70 to-white", circle: "from-amber-500 to-orange-500", text: "text-amber-600", tag: "bg-amber-100 text-amber-700" },
  tunvn:     { icon: "🛡", card: "border-teal-200 bg-gradient-to-br from-teal-50/70 to-white", circle: "from-teal-500 to-cyan-600", text: "text-teal-600", tag: "bg-teal-100 text-teal-700" },
};
const DEFAULT_THEME = { icon: "⚪", card: "border-slate-200 bg-white", circle: "from-slate-500 to-slate-600", text: "text-slate-800", tag: "bg-slate-100 text-slate-700" };

function SupplierBalanceCard({ dashboard, onRefresh, refreshing }) {
  // Collect only suppliers that are configured (non-null in response)
  const suppliers = [
    dashboard.digitrust && { id: "digitrust", ...dashboard.digitrust },
    dashboard.xpro      && { id: "xpro",      ...dashboard.xpro },
    dashboard.emstore   && { id: "emstore",    ...dashboard.emstore },
    dashboard.shotix    && { id: "shotix",     ...dashboard.shotix },
    dashboard.tunvn     && { id: "tunvn",      ...dashboard.tunvn },
  ].filter(Boolean);

  if (suppliers.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-bold text-white shadow-sm">
          <span>⚖</span>
          <span>Supplier <span className="text-cyan-400">Balances</span></span>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          title="Refresh balances"
        >
          <span className={refreshing ? "animate-spin" : ""}>↻</span>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {suppliers.map((s) => {
          const t = SUPPLIER_THEMES[s.id] || DEFAULT_THEME;
          const name = supplierName(s.id);
          const hasBalance = s.balance !== null && s.balance !== undefined;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3.5 rounded-2xl border p-4 shadow-sm transition ${t.card}`}
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${t.circle} text-xl text-white shadow`}>
                {t.icon}
              </div>
              <div className="min-w-0 flex-1 border-l border-slate-200/80 pl-3.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-800">{name}</p>
                {s.error ? (
                  <div className="mt-1">
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">Error</span>
                    <p className="mt-1 truncate text-[11px] font-medium text-blue-600" title={s.error}>ℹ {s.error}</p>
                  </div>
                ) : hasBalance ? (
                  <>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono">
                      <span className={`text-xl font-bold ${t.text}`}>${Number(s.balance).toFixed(2)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.tag}`}>USDT</span>
                    </div>
                    <div className="mt-1">
                      {s.low ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          ▼ Low balance
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          ▲ Healthy Balance
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SyncResult({ result }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
        <span className="text-lg">❌</span>
        <p className="text-sm font-medium text-red-700 dark:text-red-300">Sync failed: {result.error}</p>
      </div>
    );
  }
  const supplierEntries = Object.entries(result.suppliers || {});
  return (
    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-lg">✅</span>
        <span className="text-sm font-semibold text-green-800 dark:text-green-200">
          {result.synced} products synced
        </span>
        <span className="text-xs text-green-600 dark:text-green-400">
          {result.updated} updated
          {result.newProducts > 0 && <> · <span className="font-medium">{result.newProducts} new</span></>}
        </span>
      </div>
      {supplierEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {supplierEntries.map(([id, v]) => (
            <span
              key={id}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium ${
                v.ok
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              {v.ok ? "✓" : "✗"} {supplierName(id)}: {v.ok ? v.count : v.error}
              {v.ok && v.hint && <span className="opacity-70"> ({v.hint})</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
import { FormInput } from "../ui/FormInput";
import { PrimaryButton } from "../ui/Button";
import SectionHeading from "../ui/SectionHeading";
import BalanceMessage from "./BalanceMessage";

export default function DashboardTab({
  dashboard,
  syncing,
  syncMessage,
  runManualSync,
  adjEmail,
  setAdjEmail,
  adjAmount,
  setAdjAmount,
  adjReason,
  setAdjReason,
  adjMessage,
  adjResult,
  submitAdjustment,
  onRefreshBalances,
  refreshingBalances,
}) {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <SectionHeading title="Sync" />
        <PrimaryButton onClick={runManualSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync products now"}
        </PrimaryButton>
        {syncMessage && <SyncResult result={syncMessage} />}
      </div>

      {dashboard && (
        <SupplierBalanceCard
          dashboard={dashboard}
          onRefresh={onRefreshBalances}
          refreshing={refreshingBalances}
        />
      )}

      {dashboard && (
        <div>
          <SectionHeading title="Sales" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Orders delivered" value={dashboard.sales.ordersDelivered} />
            <StatCard label="Total sales" value={`$${dashboard.sales.totalSales.toFixed(2)}`} />
            <StatCard label="Supplier cost" value={`$${dashboard.sales.totalCost.toFixed(2)}`} />
            <StatCard label="Profit" value={`$${dashboard.sales.profit.toFixed(2)}`} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Cost is the supplier price recorded when each order was placed, so it doesn't change
            when prices change later. Orders from before this was tracked use the price at the time of the update.
          </p>
        </div>
      )}

      <div>
        <SectionHeading title="Manual wallet credit / debit" />
        <div className="max-w-sm space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
          <FormInput
            value={adjEmail}
            onChange={(e) => setAdjEmail(e.target.value)}
            placeholder="Customer email"
          />
          <FormInput
            value={adjAmount}
            onChange={(e) => setAdjAmount(e.target.value)}
            type="number"
            step="0.01"
            placeholder="Amount (negative to debit)"
            className="font-mono"
          />
          <FormInput
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            placeholder="Reason (required)"
          />
          <PrimaryButton
            onClick={submitAdjustment}
            disabled={!adjEmail || !adjAmount || !adjReason}
          >
            Apply
          </PrimaryButton>
          {adjMessage && <p className="text-sm text-muted">{adjMessage}</p>}
        </div>
        {adjResult && (
          <div className="mt-4 max-w-sm">
            <BalanceMessage result={adjResult} />
          </div>
        )}
      </div>
    </div>
  );
}
