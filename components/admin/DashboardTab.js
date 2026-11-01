import StatCard from "./StatCard";

const SUPPLIER_NAMES = { digitrust: "DigiTrust", xpro: "XPro" };
function supplierName(id) {
  return SUPPLIER_NAMES[id] || (id.startsWith("c_") ? id.slice(2).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : id);
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
