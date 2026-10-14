import { useEffect, useState } from "react";
import StatCard from "./StatCard";
import DataTable from "./DataTable";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "credited", label: "Credited" },
  { id: "pending", label: "Pending" },
  { id: "expired", label: "Expired" },
];

const BADGE = {
  credited: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  expired: "bg-border text-muted",
};

const money = (n, d = 2) => `$${Number(n).toFixed(d)}`;

// Loads only when opened / refreshed — no polling.
export default function DepositsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");

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

  const rows = data.rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Recent deposits"
        description="Wallet top-ups, plus deposit amounts that were generated but not paid."
        action={
          <SecondaryButton onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </SecondaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Credited (24h)" value={data.summary.credited24hCount} />
        <StatCard label="Credited amount (24h)" value={money(data.summary.credited24hAmount)} />
        <StatCard label="Awaiting payment" value={data.summary.pending} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter deposits">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id ? "bg-brand text-white" : "bg-brand-soft text-brand hover:bg-brand/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable minWidth="min-w-[820px]">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Credited</th>
            <th className="px-4 py-3 text-right">Exact amount</th>
            <th className="px-4 py-3">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-muted">
                No deposits here yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-muted">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-4 py-3 text-ink">{r.email}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    BADGE[r.status] || "bg-border text-muted"
                  }`}
                >
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {r.credited !== null ? money(r.credited) : `(${money(r.requested)} requested)`}
              </td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {r.exact !== null && r.exact !== undefined ? money(r.exact, 4) : "—"}
              </td>
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
