import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Alert from "../../components/ui/Alert";
import { FormInput } from "../../components/ui/FormInput";
import { PrimaryButton, SecondaryButton, LinkButton } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/States";
import CopyButton, { StepBadge } from "../../components/ui/CopyButton";
import Link from "next/link";

export default function Wallet() {
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [ledger, setLedger] = useState([]);

  // Deposit flow: request-amount -> invoice -> pay -> submit tx hash
  const [requestAmount, setRequestAmount] = useState("");
  const [invoice, setInvoice] = useState(null); // { id, amount, expires_at, payout_wallet }
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [status, setStatus] = useState("idle"); // idle | requesting | verifying | done | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!invoice) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(invoice.expires_at).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [invoice]);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    setSession(session);
    const { data } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", session.user.id)
      .single();
    setBalance(Number(data?.balance || 0));

    const [{ data: topups }, { data: adjustments }, { data: spentOrders }] = await Promise.all([
      supabase
        .from("wallet_topups")
        .select("id, amount, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("wallet_adjustments")
        .select("id, amount, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("orders")
        .select("id, total, created_at, products(title)")
        .eq("paid_with", "wallet_balance")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const entries = [
      ...(topups || []).map((t) => ({
        id: `topup-${t.id}`,
        date: t.created_at,
        label: "Top-up credit",
        amount: Number(t.amount),
      })),
      ...(adjustments || []).map((a) => ({
        id: `adj-${a.id}`,
        date: a.created_at,
        label: `Admin adjustment — ${a.reason}`,
        amount: Number(a.amount),
      })),
      ...(spentOrders || []).map((o) => ({
        id: `order-${o.id}`,
        date: o.created_at,
        label: `Purchase — ${o.products?.title || "product"}`,
        amount: -Number(o.total),
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    setLedger(entries);
  }

  async function requestInvoice() {
    setStatus("requesting");
    setMessage("");
    const res = await fetch("/api/wallet/create-deposit-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(requestAmount) }),
    });
    const data = await res.json();
    setStatus("idle");
    if (!data.success) {
      setMessage(describeInvoiceError(data.error));
      return;
    }
    setInvoice({ ...data.invoice, payout_wallet: data.payout_wallet });
    QRCode.toDataURL(data.payout_wallet, { margin: 1, width: 180 })
      .then(setQrDataUrl)
      .catch(() => {});
  }

  function cancelInvoice() {
    setInvoice(null);
    setQrDataUrl("");
    setTxHash("");
    setMessage("");
    setStatus("idle");
  }

  async function submitTopup() {
    setStatus("verifying");
    setMessage("");
    const res = await fetch("/api/wallet/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hash: txHash, invoice_id: invoice.id }),
    });
    const data = await res.json();
    if (data.success) {
      setStatus("done");
      setMessage(`Credited $${data.credited.toFixed(2)}.`);
      setTxHash("");
      setInvoice(null);
      setQrDataUrl("");
      load();
    } else {
      setStatus("error");
      setMessage(describeError(data.error, data));
    }
  }

  const expired = secondsLeft === 0;

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title="Wallet" path="/account/wallet" noindex />
      <SiteHeader session={session} balance={balance} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        <PageContainer className="space-y-6 py-8 sm:py-10" width="max-w-3xl">
          {/* Balance hero */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-card-hover sm:p-8">
            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/5" />
            <div className="relative">
              <div className="text-sm font-medium text-white/80">Wallet balance</div>
              <div className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                {balance === null ? "…" : `$${balance.toFixed(2)}`}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/85">
                <span className="rounded-full bg-white/15 px-2.5 py-1">USDT · BEP20</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1">Pay for any product instantly</span>
                <Link href="/account/withdraw" className="rounded-full bg-white px-3 py-1 font-medium text-brand hover:bg-white/90">
                  Withdraw
                </Link>
              </div>
            </div>
          </section>

          {/* Top up */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <h2 className="text-lg font-semibold text-ink">Add funds</h2>

            {!invoice && (
              <>
                <p className="mt-1 text-sm text-muted">
                  Choose an amount. We'll give you an exact figure to send, so your deposit is
                  matched to you automatically.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[5, 10, 25, 50].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRequestAmount(String(v))}
                      className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
                        Number(requestAmount) === v
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-border bg-surface text-ink hover:bg-brand-soft"
                      }`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <div className="mt-4 max-w-sm space-y-3">
                  <FormInput
                    label="Amount to add (USD)"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    placeholder="e.g. 10"
                    hint="Minimum $0.10."
                  />
                  <Alert variant="error">{status !== "requesting" ? message : ""}</Alert>
                  <PrimaryButton
                    onClick={requestInvoice}
                    disabled={!requestAmount || Number(requestAmount) < 0.1 || status === "requesting"}
                    className="w-full"
                  >
                    {status === "requesting" ? "Generating…" : "Get deposit amount"}
                  </PrimaryButton>
                </div>
              </>
            )}

            {invoice && (
              <div className="mt-4 space-y-5">
                <Alert variant="warning">
                  Send only USDT on <strong>BEP20 (BNB Smart Chain)</strong>. Other tokens or
                  networks will be lost.
                </Alert>

                {/* Step 1 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <StepBadge n={1} /> Send the exact amount
                  </div>
                  <div className="rounded-xl border border-border bg-brand-soft p-4">
                    <div className="text-xs text-muted">Send exactly</div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-3xl font-semibold text-ink">
                        ${invoice.amount.toFixed(4)}
                      </span>
                      <CopyButton value={String(invoice.amount)} label="Copy amount" />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Any other amount can't be matched automatically — it must be exact.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-start">
                    {qrDataUrl && (
                      <img
                        src={qrDataUrl}
                        alt="QR code for the payout wallet address"
                        className="h-32 w-32 flex-shrink-0 rounded-lg border border-border"
                      />
                    )}
                    <div className="w-full flex-1 space-y-2">
                      <div className="text-xs text-muted">To this address (BEP20)</div>
                      <p className="break-all rounded-lg bg-bg p-3 font-mono text-xs text-ink">
                        {invoice.payout_wallet}
                      </p>
                      <CopyButton value={invoice.payout_wallet} label="Copy address" />
                    </div>
                  </div>

                  <p
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                      expired ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                    }`}
                  >
                    {expired
                      ? "This amount has expired — request a new one."
                      : `⏱ Expires in ${formatCountdown(secondsLeft ?? 0)}`}
                  </p>
                </div>

                {/* Step 2 */}
                {!expired && (
                  <div className="space-y-3 border-t border-border pt-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <StepBadge n={2} /> Paste your transaction hash
                    </div>
                    <div className="max-w-md space-y-3">
                      <FormInput
                        label="Transaction hash"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        placeholder="0x…"
                        className="font-mono text-xs"
                      />
                      <Alert variant={status === "error" ? "error" : "success"}>{message}</Alert>
                      <PrimaryButton
                        onClick={submitTopup}
                        disabled={!txHash || status === "verifying"}
                        className="w-full"
                      >
                        {status === "verifying" ? "Checking…" : "I've sent it — verify payment"}
                      </PrimaryButton>
                    </div>
                  </div>
                )}

                <LinkButton onClick={cancelInvoice} className="text-xs">
                  {expired ? "Request a new amount" : "Cancel and start over"}
                </LinkButton>
              </div>
            )}

            {!invoice && status === "done" && message && (
              <div className="mt-4">
                <Alert variant="success">{message}</Alert>
              </div>
            )}
          </section>

          {/* History */}
          <section>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-semibold text-ink">History</h2>
              <Link href="/account/orders" className="text-sm font-medium text-brand hover:underline">
                View orders →
              </Link>
            </div>
            {ledger.length === 0 && (
              <EmptyState title="No transactions yet" description="Top-ups and wallet purchases will show up here." />
            )}
            {ledger.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                {ledger.map((entry) => {
                  const debit = entry.amount < 0;
                  return (
                    <li key={entry.id} className="flex items-center gap-3 px-4 py-3.5 text-sm sm:px-5">
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base ${
                          debit ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                        }`}
                        aria-hidden="true"
                      >
                        {debit ? "↑" : "↓"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-ink">{entry.label}</div>
                        <div className="text-xs text-muted">
                          {new Date(entry.date).toLocaleString()}
                        </div>
                      </div>
                      <span className={`font-mono font-semibold ${debit ? "text-danger" : "text-success"}`}>
                        {debit ? "−" : "+"}${Math.abs(entry.amount).toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}

function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function describeInvoiceError(code) {
  switch (code) {
    case "invalid_amount":
      return "Enter a valid amount of at least $0.10.";
    case "could_not_allocate_amount":
      return "Couldn't generate a unique amount right now — please try again.";
    default:
      return code ? code.replaceAll("_", " ") : "Something went wrong.";
  }
}

function describeError(code, data) {
  switch (code) {
    case "too_many_attempts":
      return `Too many wrong transaction hashes. Please wait ${
        Math.max(1, Math.ceil(((data && data.retry_after) || 120) / 60))
      } minute(s) and double-check the hash before trying again.`;
    case "not_found_yet":
      return "That transaction isn't visible on-chain yet — wait a bit and try again.";
    case "chain_lookup_failed":
      return "Couldn't reach the blockchain right now — try again in a moment.";
    case "tx_failed":
      return "That transaction failed on-chain — it never went through.";
    case "wrong_recipient":
      return "That transaction wasn't a USDT (BEP20) transfer to our wallet.";
    case "awaiting_confirmations":
      return "Payment seen, waiting for more confirmations — try again shortly.";
    case "tx_already_used":
      return "That transaction hash was already used.";
    case "amount_mismatch":
      return data?.received !== undefined
        ? `That transaction sent $${Number(data.received).toFixed(4)}, but this invoice needs exactly $${Number(data.expected).toFixed(4)}.`
        : "That transaction's amount doesn't match this deposit invoice.";
    case "invoice_not_found":
      return "That deposit request wasn't found — please request a new amount.";
    case "invoice_not_pending":
      return "That deposit request was already used — please request a new amount.";
    case "invoice_expired":
      return "That deposit amount expired — please request a new one.";
    default:
      return code ? code.replaceAll("_", " ") : "";
  }
}
