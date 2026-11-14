import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase } from "../lib/supabaseClient";
import Alert from "./ui/Alert";
import { PrimaryButton, SecondaryButton, LinkButton } from "./ui/Button";
import { FormInput } from "./ui/FormInput";
import CopyButton, { StepBadge } from "./ui/CopyButton";
import { useT } from "../lib/i18n";
import { CRYPTO_NETWORKS, DEFAULT_NETWORK_ID, getNetworkConfig } from "../lib/cryptoNetworks";
import CryptoBadge from "./ui/CryptoBadge";

// Used both in the checkout modal (fresh order) and on /account/orders
// (resuming a payment after a closed tab / refresh / lost connection).
// order needs: { id, total, payout_wallet }. Calls onDone(items) once
// the order is fulfilled.
export default function PaymentPanel({ order, product, onDone, onBack }) {
  const { t } = useT();
  const [method, setMethod] = useState(null); // 'wallet' | 'onchain' | null
  const [selectedNetwork, setSelectedNetwork] = useState(DEFAULT_NETWORK_ID);
  const [balance, setBalance] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [walletLoginPrompt, setWalletLoginPrompt] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [telegramLink, setTelegramLink] = useState("https://t.me/digiverse_top");
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!order?.created_at) return 30 * 60;
    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
    return Math.max(0, 30 * 60 - elapsed);
  });
  const [buffLoading, setBuffLoading] = useState(true);
  const [buffCheck, setBuffCheck] = useState(null); // { is_buff, max_qty, affordable }

  useEffect(() => {
    let active = true;
    if (order?.product_id) {
      setBuffLoading(true);
      fetch(`/api/products/buff-info?product_id=${encodeURIComponent(order.product_id)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          if (d?.is_buff) {
            const reqQty = Number(order.quantity) || 1;
            setBuffCheck({
              is_buff: true,
              max_qty: d.max_qty,
              affordable: d.max_qty >= reqQty,
            });
          } else {
            setBuffCheck({ is_buff: false });
          }
        })
        .catch(() => {
          if (active) setBuffCheck({ is_buff: false });
        })
        .finally(() => {
          if (active) setBuffLoading(false);
        });
    } else {
      setBuffLoading(false);
    }
    return () => {
      active = false;
    };
  }, [order?.product_id, order?.quantity]);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      setSessionUser(session.user);
      const { data } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", session.user.id)
        .single();
      setBalance(Number(data?.balance || 0));
    })();
    QRCode.toDataURL(order.payout_wallet, { margin: 1, width: 180 })
      .then(setQrDataUrl)
      .catch(() => {});

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.channel_type === "telegram" && d?.whatsapp_link) {
          setTelegramLink(d.whatsapp_link);
        } else if (d?.telegram_channel_link) {
          setTelegramLink(d.telegram_channel_link);
        }
      })
      .catch(() => {});
  }, [order.payout_wallet]);

  useEffect(() => {
    if (timeLeft <= 0) {
      fetch("/api/orders/cleanup-expired", { method: "POST" }).catch(() => {});
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          fetch("/api/orders/cleanup-expired", { method: "POST" }).catch(() => {});
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [order?.id]);

  const isPaymentBlocked = buffCheck?.is_buff && !buffCheck.affordable;

  const canPayWithBalance =
    balance !== null &&
    balance >= Number(order.total) &&
    !isPaymentBlocked &&
    !buffLoading;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeExpired = timeLeft === 0;

  async function payWithBalance() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/orders/pay-with-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        onDone({ items: data.items, manual: data.manual });
      } else {
        const msg = data.message || describeError(t, data.error, data) || t("Something went wrong. Please try again.");
        setError(msg);
      }
    } catch {
      setError(t("Network error — please check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/orders/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id, tx_hash: txHash, network: selectedNetwork }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        onDone({ items: data.items, manual: data.manual });
      } else {
        const msg = data.message || describeError(t, data.error, data) || t("Something went wrong. Please try again.");
        setError(msg);
      }
    } catch {
      setError(t("Network error — please check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  // Free order covered 100% by referral gift boxes ($0.00)
  if (Number(order.total) <= 0.0001) {
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-success/30 bg-success-soft/30 p-5 text-center">
          <span className="text-3xl block mb-1">🎁</span>
          <h3 className="font-bold text-base text-ink">{t("Free Gift Order!")}</h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            {t("This order is fully covered by your Muse AI referral gift boxes. No payment is required.")}
          </p>
        </div>
        {buffCheck?.is_buff && !buffCheck.affordable && (
          <Alert variant="error">
            {buffCheck.max_qty > 0
              ? t("You can order up to {n}B tokens right now. Please lower your quantity.", { n: buffCheck.max_qty })
              : t("Temporarily unavailable right now. Please check back soon.")}
          </Alert>
        )}
        <Alert variant="error">{error}</Alert>
        <div className="flex gap-3">
          {onBack && (
            <SecondaryButton onClick={onBack} className="flex-1">
              ← {t("Back")}
            </SecondaryButton>
          )}
          <PrimaryButton
            onClick={payWithBalance}
            disabled={busy || isPaymentBlocked || buffLoading}
            className={`${onBack ? "flex-1" : "w-full"} py-3 text-sm font-bold`}
          >
            {busy ? t("Redeeming Free Tokens…") : t("Claim Free Tokens Now ✨")}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (!method) {
    const isChecking = buffLoading;

    return (
      <div className="space-y-3">
        {timeExpired && (
          <Alert variant="error">
            {t("This unpaid order expired after 30 minutes and has been deleted. Please start a new order.")}
          </Alert>
        )}
        {!timeExpired && (
          <div className="text-xs text-center text-muted">
            ⏱️ {t("Payment expires in {time}", { time: `${minutes}:${seconds.toString().padStart(2, "0")}` })}
          </div>
        )}

        {/* Warning is shown ONLY when user quantity > API balance capacity */}
        {!isChecking && isPaymentBlocked && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
            <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
            <span>
              {buffCheck.max_qty > 0
                ? t("You can order up to {n}B tokens right now. Please lower your quantity.", { n: buffCheck.max_qty })
                : t("Temporarily unavailable right now. Please check back soon.")}
            </span>
          </div>
        )}

        {isChecking && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span>{t("Verifying availability…")}</span>
          </div>
        )}

        <p className="text-sm font-medium text-ink">{t("Choose how to pay")}</p>

        <div
          className={`space-y-3 transition-all duration-300 ${
            isChecking
              ? "pointer-events-none opacity-50 blur-[1.5px] select-none"
              : isPaymentBlocked || timeExpired
              ? "pointer-events-none opacity-40 blur-[1px] select-none cursor-not-allowed"
              : "opacity-100 blur-0"
          }`}
        >
          {walletLoginPrompt && !sessionUser && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-xs text-ink">
              <div className="flex items-start gap-2">
                <span className="text-base">👛</span>
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    {t("Wallet payment requires an account")}
                  </p>
                  <p className="text-muted mt-0.5 leading-relaxed">
                    {t("Log in or create an account to use store wallet balance, or select 'Pay on-chain' below to checkout immediately as guest.")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href={`/login?returnTo=/?product=${order.product_id}&buying=${encodeURIComponent(order.products?.title || 'product')}&price=${order.total}`}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover shadow-sm"
                >
                  {t("Log In")}
                </Link>
                <Link
                  href={`/signup?returnTo=/?product=${order.product_id}&buying=${encodeURIComponent(order.products?.title || 'product')}&price=${order.total}`}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brand-soft shadow-sm"
                >
                  {t("Sign Up")}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setWalletLoginPrompt(false);
                    setMethod("onchain");
                  }}
                  className="ms-auto text-xs font-semibold text-brand underline cursor-pointer"
                >
                  {t("Pay on-chain instead →")}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (!sessionUser) {
                setWalletLoginPrompt((p) => !p);
              } else {
                setMethod("wallet");
              }
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm hover:border-brand hover:bg-brand-soft transition-all"
            disabled={isChecking || isPaymentBlocked}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{t("Pay with wallet")}</span>
              {!sessionUser && (
                <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  {t("Sign up required")}
                </span>
              )}
            </div>
            {sessionUser ? (
              <span className="font-mono text-sm" dir="ltr">{t("{amount} balance", { amount: `$${(balance ?? 0).toFixed(2)}` })}</span>
            ) : (
              <span className="text-xs text-muted font-normal">{t("Click to log in")}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMethod("onchain")}
            className="flex w-full items-center justify-between rounded-xl border border-brand/40 bg-brand-soft/20 px-4 py-3.5 text-left text-sm hover:border-brand hover:bg-brand-soft/40 transition-all shadow-xs"
            disabled={isChecking || isPaymentBlocked}
          >
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1.5 overflow-hidden">
                <img src="/crypto/usdt.svg" alt="USDT" className="inline-block h-6 w-6 rounded-full ring-2 ring-surface" />
                <img src="/crypto/usdc.svg" alt="USDC" className="inline-block h-6 w-6 rounded-full ring-2 ring-surface" />
              </div>
              <div>
                <span className="font-bold text-ink block">{t("Crypto Pay (USDT & USDC)")}</span>
                <span className="text-xs text-muted">{t("Polygon · Base · BNB Chain")}</span>
              </div>
            </div>
            <span className="text-brand font-semibold text-xs">{t("Pay on-chain →")}</span>
          </button>
        </div>

        {onBack && (
          <div className="pt-2">
            <SecondaryButton onClick={onBack} className="w-full">
              ← {t("Back to quantity selection")}
            </SecondaryButton>
          </div>
        )}
      </div>
    );
  }

  if (method === "wallet") {
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex justify-between py-1">
            <span className="text-muted">{t("Available balance")}</span>
            <span className="font-mono text-ink" dir="ltr">${(balance ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted">{t("Order amount")}</span>
            <span className="font-mono text-ink" dir="ltr">${Number(order.total).toFixed(2)}</span>
          </div>
        </div>
        {buffCheck?.is_buff && !buffCheck.affordable && (
          <Alert variant="error">
            {buffCheck.max_qty > 0
              ? t("You can order up to {n}B tokens right now. Please lower your quantity.", { n: buffCheck.max_qty })
              : t("Temporarily unavailable right now. Please check back soon.")}
          </Alert>
        )}
        {!canPayWithBalance && (!buffCheck?.is_buff || buffCheck.affordable) && (
          <Alert variant="warning">{t("Insufficient wallet balance for this order.")}</Alert>
        )}
        <Alert variant="error">{error}</Alert>
        <div className="flex gap-3">
          <SecondaryButton onClick={() => setMethod(null)} className="flex-1">
            {t("Back")}
          </SecondaryButton>
          <PrimaryButton
            onClick={payWithBalance}
            disabled={busy || !canPayWithBalance || timeExpired}
            className="flex-1"
          >
            {busy ? t("Processing…") : t("Confirm")}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const exactAmount = Number(order.total).toFixed(4);
  const currentNet = getNetworkConfig(selectedNetwork);

  const activeProduct = product || order?.product || order?.products || null;
  const productTitle = activeProduct?.title || order?.product_title || null;
  const productSubtitle =
    activeProduct?.short_description ||
    activeProduct?.description?.slice(0, 60) ||
    (order?.quantity ? t("{n} digital items ready for delivery", { n: order.quantity }) : null);
  const productIcon =
    activeProduct?.icon ||
    (productTitle?.toLowerCase().includes("elevenlabs")
      ? "🎙️"
      : productTitle?.toLowerCase().includes("tokens")
      ? "✨"
      : "🔥");
  const creditBadge =
    productTitle?.match(/\d+[KMB]?\s*(Credit|Tokens?)/i)?.[0] ||
    (order?.quantity > 1 ? `${order.quantity} ${t("Items")}` : null);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <LinkButton onClick={() => setMethod(null)}>{t("← Change payment method")}</LinkButton>
        {!timeExpired && (
          <span className="text-xs font-mono text-muted">
            ⏱️ {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        )}
      </div>

      {buffCheck?.is_buff && !buffCheck.affordable && (
        <Alert variant="error">
          {buffCheck.max_qty > 0
            ? t("You can order up to {n}B tokens right now. Please lower your quantity.", { n: buffCheck.max_qty })
            : t("Temporarily unavailable right now. Please check back soon.")}
        </Alert>
      )}

      {/* Top Product Header Banner */}
      {productTitle && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 p-3.5 sm:p-4 text-white shadow-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl shadow-xs">
                {productIcon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold text-sm sm:text-base text-white">{productTitle}</h3>
                {productSubtitle && (
                  <p className="truncate text-xs text-white/70">{productSubtitle}</p>
                )}
              </div>
            </div>
            {/* Equalizer Waveform Bars */}
            <div className="flex items-center gap-1 text-brand-light flex-shrink-0" aria-hidden="true">
              <span className="h-3 w-1 rounded-full bg-brand-light/80 animate-pulse" />
              <span className="h-6 w-1 rounded-full bg-brand" />
              <span className="h-4 w-1 rounded-full bg-brand-light" />
              <span className="h-5 w-1 rounded-full bg-brand/90 animate-pulse" />
              <span className="h-2 w-1 rounded-full bg-brand-light/70" />
            </div>
          </div>
        </div>
      )}

      {/* Unified 4-Step Checkout Card */}
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-card space-y-5">
        {/* STEP 1: Choose Coin & Network */}
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white mt-0.5">
              1
            </span>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-ink">{t("Choose Coin & Network")}</h3>
              <p className="text-xs text-muted">{t("Select the blockchain network for payment")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.values(CRYPTO_NETWORKS).map((net) => {
              const active = selectedNetwork === net.id;
              const isRecommended = net.id === "usdt_bep20";
              return (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => {
                    setSelectedNetwork(net.id);
                    setError("");
                  }}
                  className={`group relative flex flex-col items-start rounded-xl border p-2.5 sm:p-3 text-left transition-all duration-150 ${
                    active
                      ? "border-brand bg-brand-soft/30 ring-1 ring-brand shadow-xs"
                      : "border-border bg-bg/50 hover:bg-surface hover:border-brand-light"
                  }`}
                >
                  {/* Active Checkmark Pill on Top-Right Corner */}
                  {active && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white shadow-xs">
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}

                  <div className="flex items-center gap-2.5 w-full">
                    <CryptoBadge networkId={net.id} size="md" />
                    <div className="min-w-0 flex-1">
                      <span className="block font-bold text-xs text-ink group-hover:text-brand transition-colors">
                        {net.token}
                      </span>
                      <span className="block text-[10px] font-medium text-muted truncate">
                        {net.shortNetwork}
                      </span>
                    </div>
                  </div>

                  {/* Recommended Badge */}
                  {isRecommended && (
                    <span className="mt-2 inline-block rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold text-white leading-none">
                      {t("Recommended")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Send exactly this amount */}
        <div className="border-t border-border/60 pt-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              2
            </span>
            <h3 className="font-bold text-sm sm:text-base text-ink">{t("Send exactly this amount")}</h3>
          </div>

          <div className="rounded-2xl border border-brand/20 bg-brand-soft/25 p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <img
                  src={currentNet.coinIcon}
                  alt={currentNet.token}
                  className="h-10 w-10 sm:h-11 sm:w-11 rounded-full shadow-xs flex-shrink-0"
                />
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-ink" dir="ltr">
                    {exactAmount}
                  </span>
                  <span className="text-xs sm:text-sm font-bold uppercase text-muted">
                    {currentNet.token}
                  </span>
                </div>
              </div>

              {creditBadge && (
                <>
                  <div className="h-8 w-px bg-border/80 hidden sm:block" />
                  <div className="flex items-center gap-1.5 rounded-full bg-surface/80 border border-border px-3 py-1 text-xs font-semibold text-ink">
                    <span className="text-amber-500 text-sm">✦</span>
                    <span>{creditBadge}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 flex justify-center">
              <CopyButton value={exactAmount} label={t("Copy amount")} />
            </div>

            <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-muted text-center">
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand text-white text-[9px] font-bold select-none">
                i
              </span>
              <span>{t("Send this exact figure, including every decimal. It is how we match your payment.")}</span>
            </div>
          </div>
        </div>

        {/* STEP 3: Scan QR Code or Send Payment */}
        <div className="border-t border-border/60 pt-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              3
            </span>
            <h3 className="font-bold text-sm sm:text-base text-ink">{t("Scan QR Code or Send Payment")}</h3>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={t("QR code for the payout wallet address")}
                className="h-32 w-32 sm:h-36 sm:w-36 flex-shrink-0 rounded-2xl border border-border bg-white p-2 shadow-xs"
              />
            )}
            <div className="w-full flex-1 space-y-2">
              <p
                dir="ltr"
                className="break-all rounded-xl border border-border bg-bg/70 p-3 font-mono text-[11px] sm:text-xs text-ink leading-relaxed select-all"
              >
                {order.payout_wallet}
              </p>
              <CopyButton value={order.payout_wallet} label={t("Copy address")} />
            </div>
          </div>

          {/* Selected Network Pill */}
          <div className="flex items-center justify-between rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 px-3.5 py-2.5 text-xs">
            <span className="text-muted font-medium">{t("Selected Network:")}</span>
            <div className="flex items-center gap-2">
              <img src={currentNet.netIcon} alt="" className="h-4 w-4 rounded-full" />
              <span className="font-bold text-brand">{currentNet.networkName}</span>
            </div>
          </div>

          {/* Warning Banner: User-requested text replacement & harmonious color matching */}
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-500/10 p-3 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 font-bold text-white text-[11px] shadow-xs">
              !
            </span>
            <p className="leading-relaxed font-medium">
              {t("Send only {token} on {network}. Sending other coins may result in loss of funds.", {
                token: currentNet.token,
                network: currentNet.networkName,
              })}
            </p>
          </div>
        </div>

        {/* STEP 4: Paste your transaction hash */}
        <div className="border-t border-border/60 pt-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              4
            </span>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-ink">{t("Paste your transaction hash")}</h3>
              <p className="text-xs text-muted font-normal">
                {t("Transaction hash ({network})", { network: currentNet.shortNetwork })}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center rounded-xl border border-border bg-bg px-3 py-2.5 transition-all focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <svg className="h-4 w-4 text-muted pe-1.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <input
                type="text"
                value={txHash}
                onChange={(e) => {
                  setTxHash(e.target.value.trim());
                  setError("");
                }}
                placeholder="0x…"
                className="w-full bg-transparent font-mono text-xs font-medium text-ink outline-none placeholder:text-muted"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                disabled={busy || timeExpired}
                aria-label={t("Transaction hash")}
              />
            </div>
            <p className="text-[11px] text-muted">
              {t("After sending, copy the transaction hash (TxID) from your wallet or exchange.")}
            </p>
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <button
            type="button"
            onClick={submitPayment}
            disabled={!txHash || busy || timeExpired}
            className="w-full rounded-2xl bg-brand hover:bg-brand-hover text-white font-bold py-3.5 px-4 shadow-md shadow-brand/25 flex items-center justify-center gap-2 text-sm sm:text-base transition-all disabled:opacity-50 active:scale-[0.99]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white flex-shrink-0">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span>{busy ? t("Checking the blockchain…") : t("Confirm Payment")}</span>
          </button>

          {/* Need help? Contact us on Telegram */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted pt-1">
            <svg
              className="h-3.5 w-3.5 text-muted shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            <span>{t("Need help?")}</span>
            <a
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              <span>{t("Contact us on Telegram")}</span>
              <svg className="h-3.5 w-3.5 text-[#229ED9] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.5 1.9 12c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.6.2 1.5 1.2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function describeError(t, code, data) {
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
    case "amount_too_low":
      return t("The amount received doesn't match the order total.");
    case "awaiting_confirmations":
      return t("Payment seen, waiting for more confirmations — try again shortly.");
    case "tx_already_used":
      return t("That transaction hash was already used on another order.");
    case "insufficient_balance":
      return t("Not enough wallet balance for this order.");
    case "out_of_stock_refund_pending":
      return t("Sold out at the last moment — your payment will be refunded manually, sorry.");
    case "fulfillment_uncertain_pending_review":
      return t("Payment received — we're double-checking delivery, this may take a few minutes.");
    case "fulfillment_failed_refund_pending":
      return t("Order placed but delivery failed — your payment will be refunded. Please contact support.");
    case "fulfillment_failed_please_contact_support":
      return t("An unexpected error occurred. Your balance has been refunded automatically. Please contact support if it doesn't appear.");
    case "out_of_stock_refund_pending_refunded":
      return t("Sold out at the last moment — your wallet balance has been refunded automatically.");
    case "fulfillment_failed_refund_pending_refunded":
      return t("Delivery failed — your wallet balance has been refunded automatically.");
    case "order_not_available":
      return t("This order is no longer available for payment. Please refresh and try again.");
    case "stock_check_failed":
      return data?.message || t("Unable to verify supplier stock right now. Please try again shortly.");
    case "supplier_balance_limit":
      return data?.message || (data?.max_qty > 0
        ? t("You can order up to {n}B tokens right now. Please lower your quantity.", { n: data.max_qty })
        : t("This product is temporarily unavailable. Please try again later."));
    default:
      return code ? code.replaceAll("_", " ") : t("Something went wrong. Please try again.");
  }
}
