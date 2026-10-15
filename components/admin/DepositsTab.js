import { useEffect, useState } from "react";
import StatCard from "./StatCard";
import DataTable from "./DataTable";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";

const TYPES = [
  { id: "all", label: "All types" },
  { id: "wallet_topup", label: "Wallet top-ups" },
  { id: "onchain_order", label: "On-chain order payments" },
  { id: "adjustment", label: "Admin adjustments" },
];

const STATES = [
  { id: "all", label: "Any status" },
  { id: "confirmed", label: "Confirmed" },
  { id: "pending", label: "Pending" },
  { id: "expired", label: "Expired" },
  { id: "problem", label: "Problem" },
];

const BADGE = {
  confirmed: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  expired: "bg-border text-muted",
  problem: "bg-danger-soft text-danger",
};

const SOURCE_LABEL = {
  wallet_topup: "Wallet top-up",
  onchain_order: "On-chain order",
  adjustment: "Admin adjustment",
};

const money = (n, d = 2) => `$${Number(n).toFixed(d)}`;

// Loads only when opened / refreshed — no polling.
export default function DepositsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [type, setType] = useState("all");
  const [state, setState] = useState("all");

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/deposits");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "failed");
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) return <LoadingState label="Loading deposits…" />;
  if (error && !data) return <ErrorState title="Couldn't load deposits" onRetry={load} />;
  if (!data) return null;

  const rows = data.rows.filter(
    (r) => (type === "all" || r.source === type) && (state === "all" || r.state === state)
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Recent deposits"
        description="Wallet top-ups, direct on-chain order payments and admin adjustments — everything that moved money in."
        action={
          <SecondaryButton onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </SecondaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Wallet top-ups (24h)"
          value={money(data.summary.topup24Amount)}
          hint={`${data.summary.topup24Count} deposit(s)`}
        />
        <StatCard
          label="On-chain orders (24h)"
          value={money(data.summary.order24Amount)}
          hint={`${data.summary.order24Count} payment(s)`}
        />
        <StatCard label="Awaiting payment" value={data.summary.pending} />
        <StatCard label="Showing" value={rows.length} hint={`of ${data.rows.length} loaded`} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {TYPES.map((f) => (
            <Chip key={f.id} active={type === f.id} onClick={() => setType(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATES.map((f) => (
            <Chip key={f.id} active={state === f.id} onClick={() => setState(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <DataTable minWidth="min-w-[980px]">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Exact amount</th>
            <th className="px-4 py-3">Details</th>
            <th className="px-4 py-3">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-4 text-muted">
                No deposits here yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-muted">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-4 py-3 text-ink">{r.email}</td>
              <td className="px-4 py-3 text-ink">{SOURCE_LABEL[r.source]}</td>
              <td className="px-4 py-3">
                <span
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                    BADGE[r.state] || "bg-border text-muted"
                  }`}
                >
                  {r.label}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {r.amount < 0 ? "−" : ""}
                {money(Math.abs(r.amount))}
              </td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {r.exact !== null && r.exact !== undefined ? money(r.exact, 4) : "—"}
              </td>
              <td className="max-w-[220px] break-words px-4 py-3 text-muted">{r.note}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {r.tx_hash ? (
                  <a
                    href={`https://bscscan.com/tx/${r.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                  >
                    {r.tx_hash.slice(0, 10)}…{r.tx_hash.slice(-6)}
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-brand text-white" : "bg-brand-soft text-brand hover:bg-brand/10"
      }`}
    >
      {children}
    </button>
  );
}
