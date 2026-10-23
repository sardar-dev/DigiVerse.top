import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Alert from "../../components/ui/Alert";
import { FormInput } from "../../components/ui/FormInput";
import { PrimaryButton } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/States";

const when = (d) => new Date(d).toLocaleString();
const BADGE = { pending: "bg-warning-soft text-warning", approved: "bg-success-soft text-success", rejected: "bg-danger-soft text-danger" };
const LABEL = { pending: "Waiting", approved: "Sent", rejected: "Rejected, refunded" };
const ERR = {
  invalid_amount: "Enter a valid amount.",
  invalid_address: "That does not look like a BEP20 address (it starts with 0x and has 42 characters).",
  below_minimum: "That is below the minimum withdrawal.",
  insufficient_balance: "You do not have that much balance.",
  too_many_pending: "You already have 3 requests waiting. Please wait for them to be processed.",
  run_migration_021: "Withdrawals are not available yet. Please try again later.",
};

export default function Withdraw() {
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    setSession(session);
    const [{ data: prof }, list] = await Promise.all([
      supabase.from("profiles").select("balance").eq("id", session.user.id).single(),
      fetch("/api/withdrawals").then((r) => r.json()),
    ]);
    setBalance(Number(prof?.balance || 0));
    if (list.success) setInfo(list);
    else setMsg({ type: "error", text: ERR[list.error] || "Could not load your requests." });
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: "", text: "" });
    const d = await (
      await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, address }),
      })
    ).json();
    setBusy(false);
    if (d.success) {
      setMsg({ type: "success", text: `Request #${d.request_number} sent. You will be paid after it is approved.` });
      setAmount("");
      setBalance(d.balance);
      load();
    } else {
      setMsg({ type: "error", text: ERR[d.error] || "Something went wrong." });
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title="Withdraw" path="/account/withdraw" noindex />
      <SiteHeader session={session} balance={balance} onSignOut={() => supabase.auth.signOut()} />
      <main className="flex-1">
        <PageContainer className="space-y-6 py-8 sm:py-10" width="max-w-2xl">
          <div>
            <Link href="/account/wallet" className="text-sm text-brand hover:underline">← Wallet</Link>
            <h1 className="mt-2 text-2xl font-semibold">Withdraw</h1>
            <p className="mt-1 text-sm text-muted">Available balance: {balance === null ? "…" : `$${balance.toFixed(2)}`}</p>
          </div>

          {!info && !msg.text && <LoadingState label="Loading…" />}

          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <FormInput
              label="Amount (USDT)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint={info ? `Minimum $${info.min}` : undefined}
              required
            />
            <FormInput
              label="Your USDT address (BEP20 / BNB Smart Chain)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              className="font-mono"
              autoComplete="off"
              required
            />
            <Alert variant="info">
              Only BEP20 addresses. Funds sent to a wrong address or network cannot be recovered. The amount leaves your balance
              now and returns if the request is rejected. Requests are paid by hand, so allow some time.
            </Alert>
            <Alert variant={msg.type === "success" ? "success" : "error"}>{msg.text}</Alert>
            <PrimaryButton type="submit" disabled={busy || !amount || !address}>
              {busy ? "Sending…" : "Request withdrawal"}
            </PrimaryButton>
          </form>

          {info && info.requests.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Your requests</h2>
              <ul className="space-y-2">
                {info.requests.map((w) => (
                  <li key={w.id} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-mono font-semibold">${Number(w.amount).toFixed(2)}</span>{" "}
                        <span className="text-xs text-muted">#{w.request_number} · {when(w.created_at)}</span>
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[w.status]}`}>{LABEL[w.status]}</span>
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-muted">{w.address}</div>
                    {w.payout_tx && <div className="mt-1 break-all text-xs text-muted">Transaction: {w.payout_tx}</div>}
                    {w.admin_note && <div className="mt-1 text-xs text-muted">Note: {w.admin_note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
