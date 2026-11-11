import { useEffect, useState, useMemo } from "react";
import Alert from "../ui/Alert";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import { FormInput } from "../ui/FormInput";

export default function ReferralCostTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/referral-costs");
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || "Failed to load cost analytics.");
      }
    } catch {
      setError("Network error loading referral costs.");
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    if (!data?.user_reports) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.user_reports;
    return data.user_reports.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [data?.user_reports, search]);

  function exportCSV() {
    if (!data?.user_reports || data.user_reports.length === 0) return;
    const headers = [
      "Username",
      "Email",
      "Total Referrals",
      "Qualified Referrals",
      "Gifts Earned",
      "Gifts Redeemed",
      "Free Tokens Delivered",
      "Actual Supplier Cost (USD)",
      "Registered At",
    ];

    const rows = data.user_reports.map((u) => [
      `"${u.username}"`,
      `"${u.email}"`,
      u.referrals_count,
      u.qualified_count,
      u.gifts_earned,
      u.gifts_redeemed,
      `"${u.free_tokens_delivered}"`,
      `$${Number(u.actual_cost_incurred).toFixed(2)}`,
      `"${new Date(u.created_at).toISOString()}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `digiverse_referral_costs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted">Loading cost analytics…</div>;
  }

  const an = data?.analytics || {};
  const wallet = data?.tunvn_wallet || {};

  return (
    <div className="space-y-6">
      {/* Top Banner with TunVN Wallet Balance */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
              <span>📊</span> Referral Cost & Wallet Analytics
            </h2>
            <p className="text-xs text-muted mt-1">
              Tracks actual supplier expenditure, outstanding liabilities, and per-user free token cost.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-brand/30 bg-brand-soft/40 px-3.5 py-2 text-xs">
              <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">
                TunVN Supplier Wallet
              </span>
              <span className="font-mono font-bold text-sm text-brand" dir="ltr">
                {wallet.configured
                  ? wallet.balance !== null
                    ? `$${Number(wallet.balance).toFixed(2)} USDT`
                    : "Connecting…"
                  : "Not Configured"}
              </span>
            </div>

            <button
              onClick={load}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted hover:text-ink hover:bg-surface-alt transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* 10 Key Dashboard Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="text-xs font-semibold text-muted">1. Total Referred Users</span>
          <div className="mt-2 text-2xl font-extrabold text-ink">{an.total_referred_users ?? 0}</div>
          <span className="text-[11px] text-muted">Registered via invite links</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="text-xs font-semibold text-muted">2. Qualified Referrals</span>
          <div className="mt-2 text-2xl font-extrabold text-success">{an.total_qualified_referrals ?? 0}</div>
          <span className="text-[11px] text-muted">Email verified</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="text-xs font-semibold text-muted">3. Total Gifts Awarded</span>
          <div className="mt-2 text-2xl font-extrabold text-ink">{an.total_gifts_awarded ?? 0}</div>
          <span className="text-[11px] text-muted">Issued boxes (1B each)</span>
        </div>

        <div className="rounded-2xl border border-brand/30 bg-brand-soft/30 p-4 shadow-card">
          <span className="text-xs font-semibold text-brand">4. Gifts Locked</span>
          <div className="mt-2 text-2xl font-extrabold text-brand">{an.total_gifts_locked ?? 0}</div>
          <span className="text-[11px] text-muted">In 30s unlock delay</span>
        </div>

        <div className="rounded-2xl border border-success/30 bg-success-soft/30 p-4 shadow-card">
          <span className="text-xs font-semibold text-success">5. Available Gifts</span>
          <div className="mt-2 text-2xl font-extrabold text-success">{an.total_gifts_available ?? 0}</div>
          <span className="text-[11px] text-muted">Usable right now</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="text-xs font-semibold text-muted">6. Gifts Redeemed</span>
          <div className="mt-2 text-2xl font-extrabold text-ink">{an.total_gifts_redeemed ?? 0}</div>
          <span className="text-[11px] text-muted">Used in orders</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="text-xs font-semibold text-muted">7. Free Tokens Delivered</span>
          <div className="mt-2 text-2xl font-extrabold text-brand">{an.total_free_tokens_delivered ?? "0B"}</div>
          <span className="text-[11px] text-muted">Fulfilled via TunVN</span>
        </div>

        <div className="rounded-2xl border border-warning/30 bg-warning-soft/30 p-4 shadow-card">
          <span className="text-xs font-semibold text-warning">8. Outstanding Liability</span>
          <div className="mt-2 text-2xl font-extrabold text-warning" dir="ltr">
            ${Number(an.total_outstanding_liability ?? 0).toFixed(2)}
          </div>
          <span className="text-[11px] text-muted">Estimated cost of unused gifts</span>
        </div>

        <div className="rounded-2xl border border-danger/30 bg-danger-soft/30 p-4 shadow-card">
          <span className="text-xs font-semibold text-danger">9. Actual Cost Spent</span>
          <div className="mt-2 text-2xl font-extrabold text-danger" dir="ltr">
            ${Number(an.total_actual_spent ?? 0).toFixed(2)}
          </div>
          <span className="text-[11px] text-muted">Supplier funds spent on free gifts</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="text-xs font-semibold text-muted">10. Users Redeemed</span>
          <div className="mt-2 text-2xl font-extrabold text-ink">{an.total_users_redeemed ?? 0}</div>
          <span className="text-[11px] text-muted">Unique customers</span>
        </div>
      </div>

      {/* Per-User Cost & Referral Report */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-ink">Per-User Cost & Referral Breakdown</h3>
            <p className="text-xs text-muted">Track how many free tokens each user received and your actual supplier expenditure.</p>
          </div>

          <div className="flex items-center gap-2">
            <FormInput
              placeholder="Search user or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs py-1.5 w-48 sm:w-60"
            />
            <SecondaryButton onClick={exportCSV} className="text-xs whitespace-nowrap py-2 px-3">
              📥 Export CSV
            </SecondaryButton>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">No user cost records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="pb-2.5 text-start font-semibold">User</th>
                  <th className="pb-2.5 text-center font-semibold">Referrals</th>
                  <th className="pb-2.5 text-center font-semibold">Qualified</th>
                  <th className="pb-2.5 text-center font-semibold">Gifts Earned</th>
                  <th className="pb-2.5 text-center font-semibold">Redeemed</th>
                  <th className="pb-2.5 text-center font-semibold">Tokens Delivered</th>
                  <th className="pb-2.5 text-end font-semibold">Actual Cost Incurred</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((u) => (
                  <tr key={u.user_id} className="text-ink">
                    <td className="py-3">
                      <div className="font-semibold">@{u.username}</div>
                      <div className="text-[11px] text-muted">{u.email}</div>
                    </td>
                    <td className="py-3 text-center font-mono">{u.referrals_count}</td>
                    <td className="py-3 text-center font-mono text-success">{u.qualified_count}</td>
                    <td className="py-3 text-center font-mono">{u.gifts_earned}</td>
                    <td className="py-3 text-center font-mono">{u.gifts_redeemed}</td>
                    <td className="py-3 text-center font-mono font-bold text-brand">{u.free_tokens_delivered}</td>
                    <td className="py-3 text-end font-mono font-bold text-danger" dir="ltr">
                      ${Number(u.actual_cost_incurred).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Cost History */}
      {data?.cost_history && data.cost_history.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="text-sm font-bold text-ink mb-2">Supplier Cost Update History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="pb-2 text-start font-semibold">Effective Date</th>
                  <th className="pb-2 text-start font-semibold">Cost per 1B Tokens</th>
                  <th className="pb-2 text-start font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.cost_history.map((h) => (
                  <tr key={h.id} className="text-ink">
                    <td className="py-2.5 text-muted">{new Date(h.effective_from).toLocaleDateString()}</td>
                    <td className="py-2.5 font-mono font-bold">${Number(h.cost_per_billion).toFixed(3)} {h.currency}</td>
                    <td className="py-2.5 text-muted">{h.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

