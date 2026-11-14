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
  const [lastDeposit, setLastDeposit] = useState(null);

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
      const credited = Number(data.credited || 0);
      const newBal = (balance ?? 0) + credited;
      setLastDeposit({
        amount: credited,
        newBalance: newBal,
        time: new Date(),
      });
      setStatus("done");
      setMessage(t("Credited ${amount}.", { amount: credited.toFixed(2) }));
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

  // Totals calculated from ledger
  const totalAdded = ledger.filter((e) => e.kind === "topup").reduce((n, e) => n + e.amount, 0);
  const totalSpent = -ledger.filter((e) => e.kind === "order").reduce((n, e) => n + e.amount, 0);
  const totalWithdrawn = -ledger.filter((e) => e.kind === "withdraw" && e.amount < 0).reduce((n, e) => n + e.amount, 0);

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={t("Wallet")} path="/account/wallet" noindex />
      <SiteHeader session={session} balance={balance} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        <PageContainer className="space-y-4 py-5 sm:space-y-5 sm:py-8" width="max-w-xl">
          {/* Balance Hero Card */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E50FF] via-[#2A54FF] to-[#5835FF] p-5 text-white shadow-xl shadow-blue-500/20 sm:p-7">
            {/* Background ambient lighting */}
            <div className="pointer-events-none absolute -end-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl" />
            <div className="pointer-events-none absolute -bottom-16 -start-12 h-40 w-40 rounded-full bg-indigo-400/20 blur-xl" />

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/90">
                    <svg className="h-4 w-4 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="2" y="5" width="20" height="14" rx="3" strokeWidth="2" />
                      <line x1="2" y1="10" x2="22" y2="10" strokeWidth="2" />
                      <circle cx="17" cy="14" r="1.5" fill="currentColor" />
                    </svg>
                    <span>{t("My Wallet")}</span>
                  </div>

                  <div className="mt-2 text-xs font-medium text-blue-100 sm:text-sm">
                    {t("Available Balance")}
                  </div>

                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-4xl font-extrabold tracking-tight sm:text-5xl" dir="ltr">
                      {balance === null ? "…" : `$${balance.toFixed(2)}`}
                    </span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/40 text-[10px] text-white/80 select-none cursor-default"
                      title={t("Available for purchases and withdrawals")}
                    >
                      ⓘ
                    </span>
                  </div>
                </div>

                {/* 3D Wallet & Coins SVG Illustration */}
                <div className="flex-shrink-0">
                  <svg
                    viewBox="0 0 120 100"
                    className="h-20 w-24 select-none drop-shadow-md sm:h-24 sm:w-28"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="goldCoinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FDE047" />
                        <stop offset="100%" stopColor="#D97706" />
                      </linearGradient>
                      <linearGradient id="walletGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4F46E5" />
                        <stop offset="100%" stopColor="#2563EB" />
                      </linearGradient>
                      <linearGradient id="walletFlapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60A5FA" />
                        <stop offset="100%" stopColor="#1D4ED8" />
                      </linearGradient>
                    </defs>
                    {/* Sparkles */}
                    <path d="M22 24L24 18L26 24L32 26L26 28L24 34L22 28L16 26Z" fill="#FDE047" opacity="0.9" />
                    <circle cx="96" cy="18" r="1.5" fill="#FDE047" opacity="0.9" />
                    {/* Back Gold Coin */}
                    <circle cx="84" cy="28" r="15" fill="url(#goldCoinGrad)" />
                    <circle cx="84" cy="28" r="12" stroke="#FDE047" strokeWidth="1.2" fill="none" opacity="0.7" />
                    {/* Front Gold Coin */}
                    <circle cx="70" cy="24" r="16" fill="url(#goldCoinGrad)" />
                    <circle cx="70" cy="24" r="13" stroke="#FDE047" strokeWidth="1.2" fill="none" opacity="0.7" />
                    <text x="70" y="29" fontSize="13" fontWeight="bold" fill="#78350F" textAnchor="middle" fontFamily="sans-serif">$</text>
                    {/* Wallet Base */}
                    <rect x="22" y="38" width="84" height="52" rx="14" fill="#1E40AF" />
                    {/* Wallet Front Body */}
                    <rect x="20" y="44" width="88" height="48" rx="14" fill="url(#walletGrad)" />
                    {/* Wallet Clasp / Flap */}
                    <path d="M72 56H96C101.5 56 106 60.5 106 66C106 71.5 101.5 76 96 76H72V56Z" fill="url(#walletFlapGrad)" />
                    <circle cx="96" cy="66" r="4" fill="#FFFFFF" />
                    <circle cx="96" cy="66" r="1.8" fill="#1D4ED8" />
                  </svg>
                </div>
              </div>

              {/* Action Buttons: Add Funds, Withdraw, My Orders */}
              <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTab("add");
                    setLastDeposit(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl py-2.5 px-2 text-xs sm:text-sm font-bold shadow-md transition-all active:scale-[0.98] ${
                    tab === "add" && !lastDeposit
                      ? "bg-white text-blue-600 shadow-white/20"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  <span className="text-base leading-none">＋</span>
                  <span>{t("Add Funds")}</span>
                </button>

                <Link
                  href="/account/withdraw"
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/15 py-2.5 px-2 text-xs sm:text-sm font-semibold text-white transition-all backdrop-blur-xs hover:bg-white/25 active:scale-[0.98]"
                >
                  <span className="text-sm leading-none">↑</span>
                  <span>{t("Withdraw")}</span>
                </Link>

                <Link
                  href="/account/orders"
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/15 py-2.5 px-2 text-xs sm:text-sm font-semibold text-white transition-all backdrop-blur-xs hover:bg-white/25 active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span>{t("My Orders")}</span>
                </Link>
              </div>
            </div>
          </section>

          {/* Quick Stats: Added, Spent, Withdrawn */}
          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Added */}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 shadow-xs sm:gap-2.5 sm:p-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 sm:h-9 sm:w-9">
                <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-3.866 0-7-1.343-7-3s3.134-3 7-3 7 1.343 7 3-3.134 3-7 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5v6c0 1.657 3.134 3 7 3s7-1.343 7-3V5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 11v6c0 1.657 3.134 3 7 3s7-1.343 7-3v-6" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-medium text-muted sm:text-[11px]">{t("Added")}</div>
                <div className="truncate font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 sm:text-base" dir="ltr">
                  ${totalAdded.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Spent */}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 shadow-xs sm:gap-2.5 sm:p-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 sm:h-9 sm:w-9">
                <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-medium text-muted sm:text-[11px]">{t("Spent")}</div>
                <div className="truncate font-mono text-xs font-bold text-ink sm:text-base" dir="ltr">
                  ${totalSpent.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Withdrawn */}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 shadow-xs sm:gap-2.5 sm:p-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 sm:h-9 sm:w-9">
                <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-medium text-muted sm:text-[11px]">{t("Withdrawn")}</div>
                <div className="truncate font-mono text-xs font-bold text-ink sm:text-base" dir="ltr">
                  ${totalWithdrawn.toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          {/* Segmented Tab Switcher */}
          <div role="tablist" className="grid grid-cols-2 rounded-2xl border border-border bg-surface p-1 shadow-xs text-xs sm:text-sm font-semibold">
            <button
              role="tab"
              aria-selected={tab === "add"}
              onClick={() => {
                setTab("add");
                setLastDeposit(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
                tab === "add" ? "bg-brand text-white shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <span>{t("Add Funds")}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "history"}
              onClick={() => setTab("history")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
                tab === "history" ? "bg-brand text-white shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>
                {t("History")} {ledger.length > 0 ? `(${ledger.length})` : ""}
              </span>
            </button>
          </div>

          {/* TAB 1: ADD FUNDS */}
          {tab === "add" && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6 space-y-4">
                <div className="flex items-center gap-2 text-base sm:text-lg font-bold text-ink">
                  <svg className="h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="2" y="5" width="20" height="14" rx="3" strokeWidth="2" />
                    <line x1="2" y1="10" x2="22" y2="10" strokeWidth="2" />
                    <circle cx="17" cy="14" r="1.5" fill="currentColor" />
                  </svg>
                  <h2>{t("Add Funds")}</h2>
                </div>

                {!invoice && (
                  <div className="space-y-4">
                    <p className="text-xs sm:text-sm text-muted leading-relaxed">
                      {t("Choose an amount. We'll give you an exact figure to send, so your deposit is matched to you automatically.")}
                    </p>

                    {/* Quick Preset Buttons */}
                    <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                      {[5, 10, 25, 50].map((v) => {
                        const isSelected = Number(requestAmount) === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setRequestAmount(String(v));
                              setMessage("");
                            }}
                            className={`rounded-xl border py-2.5 text-center text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
                              isSelected
                                ? "border-brand bg-brand-soft/70 text-brand ring-1 ring-brand shadow-xs"
                                : "border-border bg-bg/50 text-ink hover:border-brand-light hover:bg-surface"
                            }`}
                          >
                            ${v}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Amount Input Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-ink">
                        {t("Amount to add (USD)")}
                      </label>
                      <div className="flex items-center rounded-xl border border-border bg-bg px-3.5 py-3 transition-all focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                        <span className="pe-2 text-sm font-bold text-muted select-none">$</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={requestAmount}
                          onChange={(e) => {
                            setRequestAmount(e.target.value);
                            setMessage("");
                          }}
                          placeholder="0.10"
                          className="w-full bg-transparent font-mono text-base font-semibold text-ink outline-none placeholder:text-muted"
                        />
                      </div>
                      <p className="text-[11px] font-medium text-muted">{t("Minimum $0.10")}</p>
                    </div>

                    {message && status !== "requesting" && (
                      <Alert variant="error">{message}</Alert>
                    )}

                    {/* Submit Button */}
                    <button
                      type="button"
                      onClick={requestInvoice}
                      disabled={!requestAmount || Number(requestAmount) < 0.1 || status === "requesting"}
                      className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold py-3.5 px-4 shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 text-sm sm:text-base transition-all disabled:opacity-50 active:scale-[0.99]"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="5" width="20" height="14" rx="3" strokeWidth="2" />
                        <line x1="2" y1="10" x2="22" y2="10" strokeWidth="2" />
                      </svg>
                      <span>{status === "requesting" ? t("Generating…") : t("Get Deposit Amount")}</span>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Active Invoice Flow (Network Selector + Steps 1 & 2) */}
                {invoice && (
                  <div className="space-y-5 pt-1">
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

                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50/80 dark:border-amber-800/40 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 font-bold text-white text-[11px]">
                        !
                      </span>
                      <p className="leading-relaxed">
                        {t("Send only {token} on {network}. Sending other coins may result in loss of funds.", {
                          token: currentNet.token,
                          network: currentNet.networkName,
                        })}
                      </p>
                    </div>

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

                    <div className="pt-1">
                      <LinkButton onClick={cancelInvoice} className="text-xs">
                        {expired ? t("Request a new amount") : t("Cancel and start over")}
                      </LinkButton>
                    </div>
                  </div>
                )}
              </section>

              {/* Deposit Successful Receipt Card */}
              {status === "done" && lastDeposit && (
                <section className="rounded-3xl border border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-950/20 p-5 sm:p-6 space-y-4">
                  <div className="text-center space-y-2">
                    <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {/* Decorative celebratory confetti dots */}
                      <span className="absolute -top-1 -left-2 h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
                      <span className="absolute -top-2 right-1 h-1.5 w-1.5 rounded-full bg-amber-400 opacity-80" />
                      <span className="absolute -bottom-1 -right-2 h-2 w-2 rounded-full bg-blue-400 opacity-75" />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{t("Deposit Successful!")}</h3>
                    <p className="text-xs sm:text-sm text-muted">
                      {t("${amount} has been credited to your wallet.", { amount: lastDeposit.amount.toFixed(2) })}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-xs text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted">
                        <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-3.866 0-7-1.343-7-3s3.134-3 7-3 7 1.343 7 3-3.134 3-7 3z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5v6c0 1.657 3.134 3 7 3s7-1.343 7-3V5" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 11v6c0 1.657 3.134 3 7 3s7-1.343 7-3v-6" />
                        </svg>
                        <span>{t("Amount Deposited")}</span>
                      </div>
                      <span className="font-mono font-bold text-ink" dir="ltr">${lastDeposit.amount.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-2.5">
                      <div className="flex items-center gap-2 text-muted">
                        <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="5" width="20" height="14" rx="3" strokeWidth="2" />
                          <line x1="2" y1="10" x2="22" y2="10" strokeWidth="2" />
                        </svg>
                        <span>{t("New Balance")}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">${lastDeposit.newBalance.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-2.5">
                      <div className="flex items-center gap-2 text-muted">
                        <svg className="h-4 w-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>{t("Time")}</span>
                      </div>
                      <span className="text-xs text-muted">
                        {new Date(lastDeposit.time).toLocaleString(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTab("history");
                        setLastDeposit(null);
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface hover:bg-bg py-2.5 px-3 text-xs sm:text-sm font-semibold text-ink shadow-xs transition-all active:scale-[0.98]"
                    >
                      <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{t("View in History")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStatus("idle");
                        setLastDeposit(null);
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-brand hover:bg-brand-hover py-2.5 px-3 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98]"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <span>{t("Back to Wallet")}</span>
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* TAB 2: HISTORY */}
          {tab === "history" && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {[["all", t("All")], ["in", t("Money in")], ["out", t("Money out")]].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                      filter === k
                        ? "border-brand bg-brand text-white shadow-xs"
                        : "border-border bg-surface text-muted hover:text-ink hover:border-brand-light"
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
                  {ledger
                    .filter((e) => filter === "all" || (filter === "in" ? e.amount > 0 : e.amount < 0))
                    .map((entry) => {
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
                            <div className="truncate font-medium text-ink">{entry.label}</div>
                            <div className="text-xs text-muted">
                              {new Date(entry.date).toLocaleString(intlLocale(locale))}
                            </div>
                          </div>
                          <span dir="ltr" className={`font-mono font-bold ${debit ? "text-danger" : "text-success"}`}>
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
