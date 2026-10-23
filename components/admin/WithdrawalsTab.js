import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton, DangerButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/States";

const when = (d) => (d ? new Date(d).toLocaleString() : "");
const ERR = {
  run_migration_021: "Run supabase/migration_021_api_connections_withdrawals_stats.sql in the Supabase SQL editor first.",
  already_resolved: "That request was already handled.",
};

// Pending list first. Send the USDT yourself, then press Approve (add the
// transaction hash if you like). Reject returns the money to the user.
export default function WithdrawalsTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [tx, setTx] = useState({}); // id -> payout tx / note
  const [copied, setCopied] = useState("");

  async function load() {
    const r = await (await fetch("/api/admin/withdrawals")).json();
    if (r.success) {
      setD(r);
      setErr("");
    } else setErr(ERR[r.error] || r.error);
  }
  useEffect(() => {
    load();
  }, []);

  async function resolve(id, status) {
    if (status === "rejected" && !window.confirm("Reject and give the money back to the user?")) return;
    setBusy(id);
    const r = await (
      await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, payout_tx: status === "approved" ? tx[id] : "", note: status === "rejected" ? tx[id] : "" }),
      })
    ).json();
    setBusy("");
    if (!r.success) setErr(ERR[r.error] || r.error);
    await load();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("Copy:", text);
    }
  }

  if (!d && !err) return <LoadingState label="Loading withdrawals…" />;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Withdrawal requests"
        description="The amount is already taken from the user's balance. Send the USDT (BEP20) to the address, then press Approve. Reject returns the money."
        action={<SecondaryButton onClick={load}>Refresh</SecondaryButton>}
      />
      {err && <Alert variant="error">{err}</Alert>}

      {d && (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Waiting ({d.pending.length})</h3>
            {d.pending.length === 0 && <p className="text-sm text-muted">No pending requests.</p>}
            {d.pending.map((w) => (
              <div key={w.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-lg font-semibold text-ink">${Number(w.amount).toFixed(2)}</div>
                    <div className="break-all text-sm text-ink">{w.email || "unknown"}</div>
                    <div className="text-xs text-muted">
                      #{w.request_number} · {when(w.created_at)} · balance left ${Number(w.balance ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(w.address)}
                    className="max-w-full break-all rounded bg-bg px-2 py-1 text-left font-mono text-xs text-ink hover:bg-brand-soft"
                    title="Click to copy"
                  >
                    {w.address} {copied === w.address ? "✓" : "⧉"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={tx[w.id] || ""}
                    onChange={(e) => setTx((x) => ({ ...x, [w.id]: e.target.value }))}
                    placeholder="Payout tx hash (approve) or reason (reject), optional"
                    className="min-w-[220px] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
                  />
                  <PrimaryButton onClick={() => resolve(w.id, "approved")} disabled={busy === w.id}>
                    Approve (I sent it)
                  </PrimaryButton>
                  <DangerButton onClick={() => resolve(w.id, "rejected")} disabled={busy === w.id}>
                    Reject
                  </DangerButton>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Recently handled</h3>
            {d.done.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
            <ul className="space-y-1.5">
              {d.done.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <span className="min-w-0 break-all">
                    <span className="font-mono">#{w.request_number}</span> · ${Number(w.amount).toFixed(2)} · {w.email || "unknown"}
                    {w.payout_tx ? <span className="text-xs text-muted"> · tx {w.payout_tx.slice(0, 14)}…</span> : null}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${w.status === "approved" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                    {w.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
