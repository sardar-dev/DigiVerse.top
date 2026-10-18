import StatCard from "./StatCard";
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
        {syncMessage && <p className="mt-2 text-sm text-muted">{syncMessage}</p>}
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
