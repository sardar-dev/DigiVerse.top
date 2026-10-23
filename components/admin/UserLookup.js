import { useState } from "react";
import DataTable from "./DataTable";
import StatusBadge from "../ui/StatusBadge";
import { PrimaryButton } from "../ui/Button";
import { FormInput } from "../ui/FormInput";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const when = (d) => new Date(d).toLocaleString();

// Support helper: type an email, see that customer's balance, deposits,
// orders and wallet history in one place. Runs only on Search.
export default function UserLookup() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function search(e, forced) {
    e?.preventDefault();
    const q = (forced || email).trim();
    if (q.length < 3) return;
    setBusy(true);
    setError("");
    try {
      const d = await (await fetch(`/api/admin/user-lookup?email=${encodeURIComponent(q)}`)).json();
      if (!d.success) throw new Error(d.error);
      setData(d);
    } catch (err) {
      setData(null);
      setError(err.message === "email_too_short" ? "Type at least 3 characters." : "Search failed — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h3 className="mb-1 text-sm font-semibold text-ink">Find a customer</h3>
      <p className="mb-3 text-xs text-muted">
        Enter an email to see their balance, deposits, orders and wallet history.
      </p>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <FormInput
          label="Customer email"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@gmail.com"
          className="w-72 max-w-full"
          autoComplete="off"
        />
        <PrimaryButton type="submit" disabled={busy || email.trim().length < 3} className="px-5 py-2.5">
          {busy ? "Searching…" : "Search"}
        </PrimaryButton>
      </form>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {data && !data.found && (
        <div className="mt-4 text-sm text-muted">
          {data.matches ? (
            <>
              Several matches — click one:
              <div className="mt-2 flex flex-wrap gap-2">
                {data.matches.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setEmail(m);
                      search(null, m);
                    }}
                    className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-ink hover:bg-brand-soft"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          ) : (
            "No customer with that email."
          )}
        </div>
      )}

      {data?.found && (
        <div className="mt-5 space-y-6">
          <div>
            <div className="break-all text-base font-semibold text-ink">{data.user.email}</div>
            <div className="text-xs text-muted">Joined {when(data.user.joined)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Balance now", money(data.user.balance), "text-brand"],
              ["Deposited", money(data.totals.deposited), "text-ink"],
              ["Spent (delivered)", money(data.totals.spent), "text-ink"],
              ["Refunded", money(data.totals.refunded), "text-ink"],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-lg border border-border bg-bg p-3">
                <div className="text-xs text-muted">{k}</div>
                <div className={`font-mono text-lg font-semibold ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {data.pendingInvoices.length > 0 && (
            <p className="text-xs text-warning">
              Has {data.pendingInvoices.length} open deposit request(s) waiting for payment.
            </p>
          )}

          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">Orders ({data.orders.length})</h4>
            <DataTable minWidth="min-w-[820px]">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Paid with</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Supplier ref</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-muted">No orders.</td>
                  </tr>
                )}
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-border align-top last:border-0">
                    <td className="px-3 py-2 font-mono">{o.order_number}</td>
                    <td className="px-3 py-2">
                      {o.quantity}× {o.products?.title}
                      {o.coupon_code && <div className="text-xs text-success">🎟️ {o.coupon_code}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono">{money(o.total)}</td>
                    <td className="px-3 py-2 text-muted">{o.paid_with || "onchain"}</td>
                    <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                    <td className="max-w-[140px] break-all px-3 py-2 font-mono text-xs text-muted">
                      {o.supplier_order_id ? `${o.supplier_label || o.supplier || "Supplier"} #${o.supplier_order_id}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{when(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">Deposits ({data.deposits.length})</h4>
              <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-sm">
                {data.deposits.length === 0 && <li className="px-3 py-2 text-muted">No deposits.</li>}
                {data.deposits.map((t) => (
                  <li key={t.tx_hash} className="px-3 py-2">
                    <div className="flex justify-between">
                      <span className="font-mono font-medium text-success">+{money(t.amount)}</span>
                      <span className="text-xs text-muted">{when(t.created_at)}</span>
                    </div>
                    <div className="break-all font-mono text-[11px] text-muted">{t.tx_hash}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">Wallet adjustments ({data.adjustments.length})</h4>
              <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-sm">
                {data.adjustments.length === 0 && <li className="px-3 py-2 text-muted">None.</li>}
                {data.adjustments.map((a, i) => (
                  <li key={i} className="px-3 py-2">
                    <div className="flex justify-between">
                      <span className={`font-mono font-medium ${a.amount >= 0 ? "text-success" : "text-danger"}`}>
                        {a.amount >= 0 ? "+" : "−"}{money(Math.abs(a.amount))}
                      </span>
                      <span className="text-xs text-muted">{when(a.created_at)}</span>
                    </div>
                    <div className="text-xs text-muted">{a.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
