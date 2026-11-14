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
import { useT, intlLocale } from "../../lib/i18n";
import { CRYPTO_NETWORKS, DEFAULT_NETWORK_ID, getNetworkConfig } from "../../lib/cryptoNetworks";
import CryptoBadge from "../../components/ui/CryptoBadge";

export default function Wallet() {
  const { t, locale } = useT();
  const [selectedNetwork, setSelectedNetwork] = useState(DEFAULT_NETWORK_ID);
  const currentNet = getNetworkConfig(selectedNetwork);
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [tab, setTab] = useState("add"); // add | history
  const [filter, setFilter] = useState("all"); // all | in | out

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
      window.location.href = locale === "en" ? "/login" : `/${locale}/login`;
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
      ...(topups || []).map((tp) => ({
        id: `topup-${tp.id}`,
        date: tp.created_at,
        label: t("Funds added"),
        kind: "topup",
        amount: Number(tp.amount),
      })),
      ...(adjustments || []).map((a) => ({
        id: `adj-${a.id}`,
        date: a.created_at,
        label: /^Withdrawal/i.test(a.reason) ? a.reason : t("Adjustment: {reason}", { reason: a.reason }),
        kind: /^Withdrawal/i.test(a.reason) ? "withdraw" : "adjust",
        amount: Number(a.amount),
      })),
      ...(spentOrders || []).map((o) => ({
        id: `order-${o.id}`,
        date: o.created_at,
        label: o.products?.title || t("Purchase"),
        kind: "order",
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
      setMessage(describeInvoiceError(data.error, t));
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
      body: JSON.stringify({ tx_hash: txHash, invoice_id: invoice.id, network: selectedNetwork }),
    });
    const data = await res.json();
    if (data.success) {
      setStatus("done");
      setMessage(t("Credited ${amount}.", { amount: data.credited.toFixed(2) }));
      setTxHash("");
      setInvoice(null);
      setQrDataUrl("");
      load();
    } else {
      setStatus("error");
      setMessage(describeError(data.error, data, t));
    }
  }

  const expired = secondsLeft === 0;

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={t("Wallet")} path="/account/wallet" noindex />
      <SiteHeader session={session} balance={balance} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        <PageContainer className="space-y-6 py-8 sm:py-10" width="max-w-3xl">
          {/* Balance hero */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-card-hover sm:p-8">
            <div className="pointer-events-none absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-16 end-16 h-40 w-40 rounded-full bg-white/5" />
            <div className="relative">
              <div className="text-sm font-medium text-white/80">{t("Available balance")}</div>
              <div className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl" dir="ltr">
                {balance === null ? "…" : `$${balance.toFixed(2)}`}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
                <button
                  type="button"
                  onClick={() => setTab("add")}
                  className="flex flex-col items-center gap-0.5 rounded-xl bg-white px-2 py-2.5 text-sm font-semibold text-brand shadow-card hover:bg-white/90"
                >
                  <span aria-hidden="true">＋</span>{t("Add funds")}
                </button>
                <Link
                  href="/account/withdraw"
                  className="flex flex-col items-center gap-0.5 rounded-xl bg-white/15 px-2 py-2.5 text-sm font-semibold text-white hover:bg-white/25"
                >
                  <span aria-hidden="true">↗</span>{t("Withdraw")}
                </Link>
                <Link
                  href="/account/orders"
                  className="flex flex-col items-center gap-0.5 rounded-xl bg-white/15 px-2 py-2.5 text-sm font-semibold text-white hover:bg-white/25"
                >
                  <span aria-hidden="true">📦</span>{t("My orders")}
                </Link>
              </div>
              <div className="mt-4 text-xs text-white/75">{t("USDT · BEP20 · Use your balance on any product, instantly")}</div>
            </div>
          </section>

          {/* Quick totals from the loaded history */}
          {ledger.length > 0 && (
            <section className="grid grid-cols-3 gap-3">
              {[
                [t("Added"), ledger.filter((e) => e.kind === "topup").reduce((n, e) => n + e.amount, 0), "text-success"],
                [t("Spent"), -ledger.filter((e) => e.kind === "order").reduce((n, e) => n + e.amount, 0), "text-ink"],
                [t("Withdrawn"), -ledger.filter((e) => e.kind === "withdraw" && e.amount < 0).reduce((n, e) => n + e.amount, 0), "text-ink"],
              ].map(([label, v, cls]) => (
                <div key={label} className="rounded-xl border border-border bg-surface px-3 py-3 text-center shadow-card">
                  <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
                  <div className={`mt-0.5 font-mono text-base font-semibold ${cls}`} dir="ltr">${v.toFixed(2)}</div>
                </div>
              ))}
            </section>
          )}

          {/* Tabs */}
          <div role="tablist" className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1 text-sm font-medium">
            {[
              ["add", t("Add funds")],
              ["history", `${t("History")}${ledger.length ? ` (${ledger.length})` : ""}`],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-2 transition-colors ${tab === id ? "bg-brand text-white shadow-card" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "add" && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <h2 className="text-lg font-semibold text-ink">{t("Add funds")}</h2>

            {!invoice && (
              <>
                <p className="mt-1 text-sm text-muted">
                  {t("Choose an amount. We'll give you an exact figure to send, so your deposit is matched to you automatically.")}
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
                    label={t("Amount to add (USD)")}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    placeholder={t("e.g. 10")}
                    hint={t("Minimum $0.10.")}
                  />
                  <Alert variant="error">{status !== "requesting" ? message : ""}</Alert>
                  <PrimaryButton
                    onClick={requestInvoice}
                    disabled={!requestAmount || Number(requestAmount) < 0.1 || status === "requesting"}
                    className="w-full"
                  >
                    {status === "requesting" ? t("Generating…") : t("Get deposit amount")}
                  </PrimaryButton>
                </div>
              </>
            )}

            {invoice && (
              <div className="mt-4 space-y-5">
                {/* Network & Coin Selector */}
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-card space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink">
                      {t("Choose Coin & Network")}
                    </label>
                    <span className="text-[11px] text-muted font-medium bg-bg px-2.5 py-0.5 rounded-full border border-border">
                      {t("Same address on all chains")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Object.values(CRYPTO_NETWORKS).map((net) => {
                      const active = selectedNetwork === net.id;
                      return (
                        <button
                          key={net.id}
                          type="button"
                          onClick={() => {
                            setSelectedNetwork(net.id);
                            setMessage("");
                          }}
                          className={`group relative flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all duration-150 ${
                            active
                              ? "border-brand bg-brand-soft/50 ring-2 ring-brand/20 shadow-sm"
                              : "border-border bg-bg/50 hover:bg-surface hover:border-brand-light"
                          }`}
                        >
                          <CryptoBadge networkId={net.id} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-ink group-hover:text-brand transition-colors">
                                {net.token}
                              </span>
                              {active && (
                                <span className="h-2 w-2 rounded-full bg-brand ring-4 ring-brand/20" />
                              )}
                            </div>
                            <span className="block text-[10px] font-medium text-muted truncate">
                              {net.shortNetwork}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Alert variant="warning">
                  {t("Send {token} on {network}. All options use your same payout address below.", {
                    token: currentNet.token,
                    network: currentNet.networkName,
                  })}
                </Alert>

                {/* Step 1 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <StepBadge n={1} /> {t("Send the exact amount")}
                  </div>
                  <div className="rounded-xl border border-border bg-brand-soft p-4">
                    <div className="text-xs text-muted">{t("Send exactly")}</div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CryptoBadge networkId={currentNet.id} size="sm" />
                        <span className="font-mono text-3xl font-semibold text-ink" dir="ltr">
                          ${invoice.amount.toFixed(4)} <span className="text-sm font-medium text-muted">{currentNet.token}</span>
                        </span>
                      </div>
                      <CopyButton value={String(invoice.amount)} label={t("Copy amount")} />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {t("Any other amount can't be matched automatically — it must be exact.")}
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-start">
                    {qrDataUrl && (
                      <img
                        src={qrDataUrl}
                        alt={t("QR code for the payout wallet address")}
                        className="h-32 w-32 flex-shrink-0 rounded-lg border border-border bg-white p-1"
                      />
                    )}
                    <div className="w-full flex-1 space-y-2">
                      <div className="text-xs text-muted">{t("To this address (Same for all networks)")}</div>
                      <p dir="ltr" className="break-all rounded-lg bg-bg p-3 font-mono text-xs text-ink">
                        {invoice.payout_wallet}
                      </p>
                      <CopyButton value={invoice.payout_wallet} label={t("Copy address")} />
                    </div>
                  </div>

                  <p
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                      expired ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                    }`}
                  >
                    {expired
                      ? t("This amount has expired — request a new one.")
                      : t("⏱ Expires in {time}", { time: formatCountdown(secondsLeft ?? 0) })}
                  </p>
                </div>

                {/* Step 2 */}
                {!expired && (
                  <div className="space-y-3 border-t border-border pt-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <StepBadge n={2} /> {t("Paste your transaction hash")}
                    </div>
                    <div className="max-w-md space-y-3">
                      <FormInput
                        label={t("Transaction hash")}
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        placeholder="0x…"
                        className="font-mono text-xs" dir="ltr"
                      />
                      <Alert variant={status === "error" ? "error" : "success"}>{message}</Alert>
                      <PrimaryButton
                        onClick={submitTopup}
                        disabled={!txHash || status === "verifying"}
                        className="w-full"
                      >
                        {status === "verifying" ? t("Checking…") : t("I've sent it — verify payment")}
                      </PrimaryButton>
                    </div>
                  </div>
                )}

                <LinkButton onClick={cancelInvoice} className="text-xs">
                  {expired ? t("Request a new amount") : t("Cancel and start over")}
                </LinkButton>
              </div>
            )}

            {!invoice && status === "done" && message && (
              <div className="mt-4">
                <Alert variant="success">{message}</Alert>
              </div>
            )}
          </section>

          )}

          {tab === "history" && (
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {[["all", t("All")], ["in", t("Money in")], ["out", t("Money out")]].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    filter === k ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {ledger.length === 0 && (
              <EmptyState title={t("No transactions yet")} description={t("Top-ups and wallet purchases will show up here.")} />
            )}
            {ledger.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                {ledger.filter((e) => filter === "all" || (filter === "in" ? e.amount > 0 : e.amount < 0)).map((entry) => {
                  const debit = entry.amount < 0;
                  return (
                    <li key={entry.id} className="flex items-center gap-3 px-4 py-3.5 text-sm sm:px-5">
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base ${
                          debit ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                        }`}
                        aria-hidden="true"
                      >
                        {{ topup: "＋", order: "🛍", withdraw: "↗", adjust: "±" }[entry.kind] || (debit ? "↑" : "↓")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-ink">{entry.label}</div>
                        <div className="text-xs text-muted">
                          {new Date(entry.date).toLocaleString(intlLocale(locale))}
                        </div>
                      </div>
                      <span dir="ltr" className={`font-mono font-semibold ${debit ? "text-danger" : "text-success"}`}>
                        {debit ? "−" : "+"}${Math.abs(entry.amount).toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          )}
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

function describeInvoiceError(code, t) {
  switch (code) {
    case "invalid_amount":
      return t("Enter a valid amount of at least $0.10.");
    case "could_not_allocate_amount":
      return t("Couldn't generate a unique amount right now — please try again.");
    default:
      return code ? code.replaceAll("_", " ") : t("Something went wrong.");
  }
}

function describeError(code, data, t) {
  switch (code) {
    case "too_many_attempts":
      return t("Too many wrong transaction hashes. Please wait {n} minute(s) and double-check the hash before trying again.", {
        n: Math.max(1, Math.ceil(((data && data.retry_after) || 120) / 60)),
      });
    case "not_found_yet":
      return t("That transaction isn't visible on-chain yet — wait a bit and try again.");
    case "chain_lookup_failed":
      return t("Couldn't reach the blockchain right now — try again in a moment.");
    case "tx_failed":
      return t("That transaction failed on-chain — it never went through.");
    case "wrong_recipient":
      return t("That transaction wasn't a valid transfer to our wallet in the expected token or network.");
    case "awaiting_confirmations":
      return t("Payment seen, waiting for more confirmations — try again shortly.");
    case "tx_already_used":
      return t("That transaction hash was already used.");
    case "amount_mismatch":
      return data?.received !== undefined
        ? t("That transaction sent ${received}, but this invoice needs exactly ${expected}.", {
            received: Number(data.received).toFixed(4),
            expected: Number(data.expected).toFixed(4),
          })
        : t("That transaction's amount doesn't match this deposit invoice.");
    case "invoice_not_found":
      return t("That deposit request wasn't found — please request a new amount.");
    case "invoice_not_pending":
      return t("That deposit request was already used — please request a new amount.");
    case "invoice_expired":
      return t("That deposit amount expired — please request a new one.");
    default:
      return code ? code.replaceAll("_", " ") : "";
  }
}
