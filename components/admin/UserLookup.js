import { useState } from "react";
import DataTable from "./DataTable";
import StatusBadge from "../ui/StatusBadge";
import BalanceMessage from "./BalanceMessage";
import { PrimaryButton } from "../ui/Button";
import { FormInput } from "../ui/FormInput";
import { TouchCopy } from "../ui/CopyButton";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const when = (d) => (d ? new Date(d).toLocaleString() : "—");

function Badge({ children, tone = "neutral" }) {
  const styles = {
    neutral: "border-border bg-bg text-muted",
    success: "border-success/30 bg-success-soft text-success",
    warning: "border-warning/30 bg-warning-soft text-warning",
    danger: "border-danger/30 bg-danger-soft text-danger",
    brand: "border-brand/30 bg-brand-soft text-brand",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}

// Comprehensive 360-degree customer lookup for admin support & fraud review.
// Queries only on demand when Search is clicked.
export default function UserLookup() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("orders"); // orders | wallet | withdrawals | referrals | support | security

  // Inline "+/- Adjust Balance" quick action state
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjError, setAdjError] = useState("");
  const [adjResult, setAdjResult] = useState(null);

  async function search(e, forced) {
    e?.preventDefault();
    const q = (forced || email).trim();
    if (q.replace(/^@+/, "").length < 3) return;
    setBusy(true);
    setError("");
    setAdjAmount("");
    setAdjReason("");
    setAdjError("");
    setAdjResult(null);
    try {
      const d = await (await fetch(`/api/admin/user-lookup?email=${encodeURIComponent(q)}`)).json();
      if (!d.success) throw new Error(d.error);
      setData(d);
      if (d.found) setSection("orders");
    } catch (err) {
      setData(null);
      setError(err.message === "email_too_short" ? "Type at least 3 characters." : "Search failed — try again.");
    }
    setBusy(false);
  }

  async function submitInlineAdjustment(e) {
    e?.preventDefault();
    if (!data?.user?.email) return;
    const value = Number(adjAmount);
    const reason = adjReason.trim();
    if (!value || !reason) return;

    setAdjBusy(true);
    setAdjError("");
    setAdjResult(null);
    try {
      const res = await fetch("/api/admin/wallet-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.user.email,
          amount: value,
          reason,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "failed");

      const nextBal = Number(json.balance);
      setData((prev) =>
        prev?.found
          ? {
              ...prev,
              user: { ...prev.user, balance: nextBal },
              adjustments: [
                {
                  id: `local-${Date.now()}`,
                  amount: value,
                  reason,
                  created_at: new Date().toISOString(),
                },
                ...(prev.adjustments || []),
              ],
            }
          : prev
      );
      setAdjResult({ email: data.user.email, amount: value, balance: nextBal });
      setAdjAmount("");
      setAdjReason("");
    } catch (err) {
      setAdjError(err.message || "Adjustment failed.");
    } finally {
      setAdjBusy(false);
    }
  }

  function jumpToCustomer(target) {
    if (!target) return;
    setEmail(target);
    search(null, target);
  }

  const u = data?.user;
  const tot = data?.totals;
  const sec = data?.security;

  const tabs = data?.found
    ? [
        { id: "orders", label: `Orders (${data.orders.length})` },
        { id: "wallet", label: `Deposits & Wallet (${data.deposits.length + data.invoices.length + data.adjustments.length})` },
        { id: "withdrawals", label: `Withdrawals (${data.withdrawals.length})` },
        { id: "referrals", label: `Referrals & Gifts (${data.referrals.length + data.gifts.length})` },
        { id: "support", label: `Support & Messages (${data.tickets.length + data.messages.length + data.feedback.length})` },
        {
          id: "security",
          label: `Security & Devices (${sec?.linkedAccounts?.length || 0})`,
          alert: Boolean(sec?.isIpBanned || sec?.isDeviceBanned || (sec?.linkedAccounts?.length || 0) > 0),
        },
      ]
    : [];

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h3 className="mb-1 text-sm font-semibold text-ink">Find a customer</h3>
      <p className="mb-3 text-xs text-muted">
        Enter an email, @username, or user ID to inspect complete account details, orders, deposits, referrals, support history, and security signals.
      </p>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <FormInput
          label="Customer email, @username, or ID"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@gmail.com or @username"
          className="w-72 max-w-full"
          autoComplete="off"
        />
        <PrimaryButton
          type="submit"
          disabled={busy || email.trim().replace(/^@+/, "").length < 3}
          className="px-5 py-2.5"
        >
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
                {data.matches.map((m) => {
                  const val = typeof m === "string" ? m : m.email;
                  const lbl = typeof m === "string" ? m : m.label;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => jumpToCustomer(val)}
                      className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-ink hover:bg-brand-soft"
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            "No customer found matching that email or username."
          )}
        </div>
      )}

      {data?.found && u && (
        <div className="mt-6 space-y-5">
          {/* Customer Identity Header */}
          <div className="rounded-xl border border-border bg-bg/50 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_admin && <Badge tone="brand">🛡️ Admin</Badge>}
                  <Badge tone={u.email_confirmed ? "success" : "warning"}>
                    {u.email_confirmed ? "✓ Email Verified" : "⏳ Unverified Email"}
                  </Badge>
                  <Badge tone="neutral">Auth: {u.provider || "email"}</Badge>
                  {u.banned_until && <Badge tone="danger">🚫 Auth Banned</Badge>}
                  {sec?.isIpBanned && <Badge tone="danger">🚫 IP Banned</Badge>}
                  {sec?.isDeviceBanned && <Badge tone="danger">🚫 Device Banned</Badge>}
                </div>

                <div className="grid gap-2 pt-1 sm:grid-cols-3">
                  {u.email ? (
                    <TouchCopy value={u.email} prefix="Email:" />
                  ) : (
                    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted">
                      Email: —
                    </div>
                  )}
                  {u.username ? (
                    <TouchCopy value={`@${u.username}`} prefix="User:" mono />
                  ) : (
                    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted">
                      User: Not set
                    </div>
                  )}
                  <TouchCopy value={u.id} prefix="UUID:" mono />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/70 pt-2.5 text-xs text-muted">
              <span>Joined: <strong className="text-ink">{when(u.joined)}</strong></span>
              <span>Last sign-in: <strong className="text-ink">{when(u.last_sign_in)}</strong></span>
              {u.inviter && (
                <span>
                  Referred by:{" "}
                  <button
                    type="button"
                    onClick={() => jumpToCustomer(u.inviter.email || u.inviter.username)}
                    className="font-semibold text-brand hover:underline cursor-pointer"
                  >
                    {u.inviter.email || `@${u.inviter.username}`}
                    {u.inviter.username && u.inviter.email ? ` (@${u.inviter.username})` : ""}
                  </button>
                  {u.referral_status && <span className="ms-1 text-[11px]">({u.referral_status})</span>}
                </span>
              )}
            </div>
          </div>

          {/* 8 Key Financial & Account Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Balance now", money(u.balance), "text-brand", null],
              ["Deposited", money(tot.deposited), "text-ink", `${tot.deposit_count} confirmed top-up(s)`],
              ["Total spent", money(tot.spent), "text-ink", `${tot.paid_orders} paid / ${tot.orders} total orders`],
              ["Refunded", money(tot.refunded), "text-ink", `Net profit: ${money(tot.net_profit)}`],
              ["Withdrawn", money(tot.withdrawn_approved), "text-ink", tot.withdraw_pending > 0 ? `${money(tot.withdraw_pending)} pending` : "No pending payouts"],
              ["Gift boxes", `${tot.gifts_available} avail`, "text-success", `${tot.gifts_locked} locked · ${tot.gifts_redeemed} used`],
              ["Referrals invited", `${tot.referrals_qualified} / ${tot.referrals_total}`, "text-ink", `${(Number(tot.tokens_redeemed || 0) / 1e9).toFixed(0)}B free tokens claimed`],
              ["Support tickets", String(tot.tickets_total), tot.open_tickets > 0 ? "text-warning" : "text-ink", `${tot.open_tickets} open`],
            ].map(([label, valStr, color, sub]) => (
              <div key={label} className="rounded-lg border border-border bg-bg p-3">
                <div className="text-[11px] text-muted">{label}</div>
                <div className={`font-mono text-lg font-semibold ${color}`}>{valStr}</div>
                {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
              </div>
            ))}
          </div>

          {data.pendingInvoices.length > 0 && (
            <p className="rounded-lg border border-warning/30 bg-warning-soft/30 px-3 py-2 text-xs font-medium text-warning">
              Has {data.pendingInvoices.length} open deposit invoice(s) awaiting payment.
            </p>
          )}

          {/* Inline +/- Adjust Balance Quick Action */}
          {u.email && (
            <div className="rounded-xl border border-border bg-bg/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">
                    Quick Action: +/- Adjust Balance
                  </h4>
                  <p className="text-[11px] text-muted">
                    Applies directly to <span className="font-mono text-ink">{u.email}</span> (positive to credit, negative to deduct).
                  </p>
                </div>
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-xs font-semibold text-brand">
                  Current: {money(u.balance)}
                </span>
              </div>

              <form onSubmit={submitInlineAdjustment} className="grid gap-2.5 sm:grid-cols-[140px_1fr_auto] sm:items-end">
                <FormInput
                  label="Amount ($)"
                  type="number"
                  step="0.01"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="+5 or -2"
                  className="font-mono"
                />
                <FormInput
                  label="Reason"
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Manual deposit / refund / correction"
                />
                <PrimaryButton
                  type="submit"
                  disabled={adjBusy || !Number(adjAmount) || !adjReason.trim()}
                  className="px-5 py-2.5"
                >
                  {adjBusy ? "Applying…" : "Apply"}
                </PrimaryButton>
              </form>

              {adjError && <p className="text-xs text-danger">Failed: {adjError}</p>}
              {adjResult && (
                <div className="max-w-md pt-1">
                  <BalanceMessage result={adjResult} />
                </div>
              )}
            </div>
          )}

          {/* Section Switcher Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setSection(tb.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  section === tb.id
                    ? "bg-brand text-white shadow-xs"
                    : "border border-border bg-bg text-ink hover:border-brand/50"
                }`}
              >
                <span>{tb.label}</span>
                {tb.alert && (
                  <span className={`h-2 w-2 rounded-full ${section === tb.id ? "bg-white" : "bg-danger"}`} />
                )}
              </button>
            ))}
          </div>

          {/* TAB 1: ORDERS */}
          {section === "orders" && (
            <div>
              <DataTable minWidth="min-w-[920px]">
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Paid with</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Customer Input & Delivered</th>
                    <th className="px-3 py-2">Tx Hash / Ref</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-muted">No orders found.</td>
                    </tr>
                  )}
                  {data.orders.map((o) => {
                    const itemsList = Array.isArray(o.items) ? o.items : o.items ? [o.items] : [];
                    return (
                      <tr key={o.id} className="border-b border-border align-top last:border-0 text-xs">
                        <td className="px-3 py-2.5 font-mono text-ink">{o.order_number}</td>
                        <td className="px-3 py-2.5 text-ink">
                          <div className="font-medium">{o.quantity}× {o.products?.title || `Product #${o.product_id}`}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {o.is_guest && <Badge tone="warning">Guest order</Badge>}
                            {o.coupon_code && <Badge tone="success">🎟️ {o.coupon_code} (−{money(o.discount_amount)})</Badge>}
                            {Number(o.gifts_redeemed || 0) > 0 && (
                              <Badge tone="brand">🎁 {o.gifts_redeemed} Gift Box (−{money(o.gift_discount)})</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-ink whitespace-nowrap">
                          <div>{money(o.total)}</div>
                          {o.expected_amount != null && Number(o.expected_amount) !== Number(o.total) && (
                            <div className="text-[11px] text-muted">Exact: ${Number(o.expected_amount).toFixed(4)}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted">{o.paid_with || "onchain"}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={o.status} />
                          {o.failure_reason && (
                            <div className="mt-1 max-w-[180px] break-all rounded bg-amber-500/10 p-1.5 font-mono text-[10px] text-amber-400">
                              {o.failure_reason}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[230px] px-3 py-2.5 space-y-1.5">
                          {o.activation_info && <TouchCopy value={o.activation_info} mono />}
                          {o.email && <TouchCopy value={o.email} prefix="Email:" />}
                          {itemsList.map((it, idx) => (
                            <div key={idx} className="max-h-20 overflow-y-auto whitespace-pre-wrap break-all rounded bg-bg px-2 py-1 font-mono text-[11px] text-ink border border-border/60">
                              {typeof it === "string" ? it : JSON.stringify(it)}
                            </div>
                          ))}
                          {!o.activation_info && !o.email && itemsList.length === 0 && (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="max-w-[180px] px-3 py-2.5 space-y-1">
                          {o.tx_hash && <TouchCopy value={o.tx_hash} mono />}
                          {(o.supplier_order_id || o.digitrust_order_id) && (
                            <TouchCopy
                              value={o.supplier_order_id || o.digitrust_order_id}
                              prefix={`${o.supplier_label || o.supplier || "Ref"}:`}
                              mono
                            />
                          )}
                          {!o.tx_hash && !o.supplier_order_id && !o.digitrust_order_id && (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">{when(o.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          )}

          {/* TAB 2: DEPOSITS, INVOICES & ADJUSTMENTS */}
          {section === "wallet" && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Confirmed Deposits ({data.deposits.length})
                </h4>
                <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-sm">
                  {data.deposits.length === 0 && <li className="px-3 py-2.5 text-xs text-muted">No deposits.</li>}
                  {data.deposits.map((t) => (
                    <li key={t.id || t.tx_hash} className="space-y-1 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-success">+{money(t.amount)}</span>
                        <span className="text-[11px] text-muted">{when(t.created_at)}</span>
                      </div>
                      <TouchCopy value={t.tx_hash} mono />
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Deposit Invoices ({data.invoices.length})
                </h4>
                <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-sm">
                  {data.invoices.length === 0 && <li className="px-3 py-2.5 text-xs text-muted">No deposit invoices.</li>}
                  {data.invoices.map((inv) => (
                    <li key={inv.id} className="space-y-1 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-ink">
                          {money(inv.requested_amount)}{" "}
                          <span className="text-muted font-normal">(${Number(inv.unique_amount).toFixed(4)})</span>
                        </span>
                        <Badge tone={inv.status === "matched" ? "success" : inv.status === "pending" ? "warning" : "neutral"}>
                          {inv.status}
                        </Badge>
                      </div>
                      {inv.tx_hash && <TouchCopy value={inv.tx_hash} mono />}
                      <div className="text-[11px] text-muted">{when(inv.created_at)}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Wallet Adjustments ({data.adjustments.length})
                </h4>
                <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-sm">
                  {data.adjustments.length === 0 && <li className="px-3 py-2.5 text-xs text-muted">None.</li>}
                  {data.adjustments.map((a, i) => (
                    <li key={a.id || i} className="px-3 py-2.5">
                      <div className="flex justify-between gap-2">
                        <span className={`font-mono font-semibold ${a.amount >= 0 ? "text-success" : "text-danger"}`}>
                          {a.amount >= 0 ? "+" : "−"}{money(Math.abs(a.amount))}
                        </span>
                        <span className="text-[11px] text-muted">{when(a.created_at)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted break-words">{a.reason}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: WITHDRAWALS */}
          {section === "withdrawals" && (
            <DataTable minWidth="min-w-[780px]">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Request #</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Payout Address</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Payout Tx / Note</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.withdrawals.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-xs text-muted">No withdrawal requests.</td>
                  </tr>
                )}
                {data.withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-border align-top last:border-0 text-xs">
                    <td className="px-3 py-2.5 font-mono">#{w.request_number}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-ink">{money(w.amount)}</td>
                    <td className="px-3 py-2.5 text-muted">{w.network || w.method || "Crypto"}</td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <TouchCopy value={w.address} mono />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={w.status === "approved" ? "success" : w.status === "pending" ? "warning" : "danger"}>
                        {w.status}
                      </Badge>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5 space-y-1">
                      {w.payout_tx && <TouchCopy value={w.payout_tx} mono />}
                      {w.admin_note && <div className="text-muted">{w.admin_note}</div>}
                      {!w.payout_tx && !w.admin_note && <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">
                      <div>{when(w.created_at)}</div>
                      {w.resolved_at && <div className="text-[11px]">Resolved: {when(w.resolved_at)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}

          {/* TAB 4: REFERRALS & GIFT BOXES */}
          {section === "referrals" && (
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Invited Users ({data.referrals.length})
                </h4>
                <DataTable minWidth="min-w-[760px]">
                  <thead className="border-b border-border text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Referred User</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">IP Address</th>
                      <th className="px-3 py-2">Device ID</th>
                      <th className="px-3 py-2">Note / Flag</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-xs text-muted">No referred signups.</td>
                      </tr>
                    )}
                    {data.referrals.map((r) => (
                      <tr key={r.id} className="border-b border-border align-top last:border-0 text-xs">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => jumpToCustomer(r.referred_email || r.referred_username || r.referred_id)}
                            className="font-medium text-brand hover:underline text-left cursor-pointer"
                          >
                            {r.referred_email || r.referred_id}
                          </button>
                          {r.referred_username && (
                            <div className="font-mono text-[11px] text-muted">@{r.referred_username}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={r.status === "qualified" ? "success" : /fraud|reject/i.test(r.status) ? "danger" : "warning"}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted">{r.registration_ip || "—"}</td>
                        <td className="max-w-[160px] px-3 py-2.5 font-mono text-muted break-all">{r.device_id || "—"}</td>
                        <td className="max-w-[180px] px-3 py-2.5 text-muted">{r.suspicious_reason || "—"}</td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">{when(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Gift Boxes ({data.gifts.length})
                </h4>
                <DataTable minWidth="min-w-[700px]">
                  <thead className="border-b border-border text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Reward</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Unlocked / Available</th>
                      <th className="px-3 py-2">Redeemed</th>
                      <th className="px-3 py-2">Order / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gifts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-xs text-muted">No gift boxes.</td>
                      </tr>
                    )}
                    {data.gifts.map((g) => (
                      <tr key={g.id} className="border-b border-border align-top last:border-0 text-xs">
                        <td className="px-3 py-2.5 font-medium text-ink">
                          {(Number(g.reward_quantity || 1000000000) / 1e9).toFixed(0)}B {g.reward_type === "muse_ai_tokens" ? "Muse AI Tokens" : g.reward_type}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={g.status === "available" ? "success" : g.status === "redeemed" ? "brand" : g.status === "revoked" ? "danger" : "warning"}>
                            {g.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">{when(g.available_at)}</td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">{when(g.redeemed_at)}</td>
                        <td className="px-3 py-2.5 text-muted">
                          {g.order_id && <span className="font-mono text-[11px]">Order: {g.order_id.slice(0, 8)}</span>}
                          {g.revoked_reason && <div className="text-danger">{g.revoked_reason}</div>}
                          {!g.order_id && !g.revoked_reason && "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            </div>
          )}

          {/* TAB 5: SUPPORT TICKETS, ADMIN MESSAGES & FEEDBACK */}
          {section === "support" && (
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Support Tickets ({data.tickets.length})
                </h4>
                <DataTable minWidth="min-w-[640px]">
                  <thead className="border-b border-border text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Ticket #</th>
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2">Order #</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-xs text-muted">No support tickets.</td>
                      </tr>
                    )}
                    {data.tickets.map((tk) => (
                      <tr key={tk.id} className="border-b border-border last:border-0 text-xs">
                        <td className="px-3 py-2.5 font-mono">#{tk.ticket_number}</td>
                        <td className="px-3 py-2.5 text-ink font-medium">{tk.name}</td>
                        <td className="px-3 py-2.5 font-mono text-muted">{tk.order_number || "—"}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={tk.status === "open" ? "warning" : tk.status === "answered" ? "success" : "neutral"}>
                            {tk.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">{when(tk.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Direct Admin Messages ({data.messages.length})
                  </h4>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-xs">
                    {data.messages.length === 0 && <li className="px-3 py-2.5 text-muted">No direct messages.</li>}
                    {data.messages.map((m) => (
                      <li key={m.id} className="space-y-1 px-3 py-2.5">
                        <div className="flex justify-between gap-2 font-semibold text-ink">
                          <span>{m.subject}</span>
                          <span className="font-normal text-muted">{when(m.created_at)}</span>
                        </div>
                        <p className="text-muted whitespace-pre-wrap">{m.body}</p>
                        {m.reply_body && (
                          <div className="rounded border border-brand/20 bg-brand-soft/30 p-2 text-ink">
                            <strong>User reply:</strong> {m.reply_body}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Site Feedback ({data.feedback.length})
                  </h4>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-bg text-xs">
                    {data.feedback.length === 0 && <li className="px-3 py-2.5 text-muted">No feedback messages.</li>}
                    {data.feedback.map((f) => (
                      <li key={f.id} className="space-y-1 px-3 py-2.5">
                        <div className="flex justify-between text-muted">
                          <span>{f.read ? "Read" : "Unread"}</span>
                          <span>{when(f.created_at)}</span>
                        </div>
                        <p className="text-ink whitespace-pre-wrap">{f.message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SECURITY, DEVICES & LINKED ACCOUNTS */}
          {section === "security" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-bg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">Registration IP</span>
                    {sec?.isIpBanned && <Badge tone="danger">Banned</Badge>}
                  </div>
                  {u.registration_ip ? <TouchCopy value={u.registration_ip} mono /> : <span className="text-xs text-muted">Not recorded</span>}
                </div>

                <div className="rounded-lg border border-border bg-bg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">Device ID</span>
                    {sec?.isDeviceBanned && <Badge tone="danger">Banned</Badge>}
                  </div>
                  {u.device_id ? <TouchCopy value={u.device_id} mono /> : <span className="text-xs text-muted">Not recorded</span>}
                </div>
              </div>

              {sec?.bans?.length > 0 && (
                <div className="rounded-lg border border-danger/30 bg-danger-soft/30 p-3.5 text-xs space-y-1">
                  <div className="font-semibold text-danger">Active Security Bans:</div>
                  {sec.bans.map((b, i) => (
                    <div key={i} className="text-ink">
                      • <strong className="uppercase">{b.type}</strong> (<code className="font-mono">{b.value}</code>): {b.reason || "No reason"} — {when(b.created_at)}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Other Accounts Sharing Same IP or Device ({sec?.linkedAccounts?.length || 0})
                </h4>
                <DataTable minWidth="min-w-[640px]">
                  <thead className="border-b border-border text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Email / Username</th>
                      <th className="px-3 py-2">Shared Match</th>
                      <th className="px-3 py-2">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!sec?.linkedAccounts || sec.linkedAccounts.length === 0) && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-xs text-muted">
                          No other accounts detected on this IP or device.
                        </td>
                      </tr>
                    )}
                    {(sec?.linkedAccounts || []).map((la) => (
                      <tr key={la.id} className="border-b border-border last:border-0 text-xs">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => jumpToCustomer(la.email || la.id)}
                            className="font-medium text-brand hover:underline cursor-pointer"
                          >
                            {la.email || la.id}
                          </button>
                          {la.username && <div className="font-mono text-[11px] text-muted">@{la.username}</div>}
                        </td>
                        <td className="px-3 py-2.5 space-x-1">
                          {u.device_id && la.device_id === u.device_id && <Badge tone="warning">Same Device</Badge>}
                          {u.registration_ip && la.registration_ip === u.registration_ip && <Badge tone="warning">Same IP</Badge>}
                        </td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">{when(la.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
