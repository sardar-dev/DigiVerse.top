import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabaseClient";
import Alert from "./ui/Alert";
import { PrimaryButton, SecondaryButton, LinkButton } from "./ui/Button";
import { FormInput } from "./ui/FormInput";
import CopyButton, { StepBadge } from "./ui/CopyButton";
import { useT } from "../lib/i18n";

// Used both in the checkout modal (fresh order) and on /account/orders
// (resuming a payment after a closed tab / refresh / lost connection).
// order needs: { id, total, payout_wallet }. Calls onDone(items) once
// the order is fulfilled.
export default function PaymentPanel({ order, onDone, onBack }) {
  const { t } = useT();
  const [method, setMethod] = useState(null); // 'wallet' | 'onchain' | null
  const [balance, setBalance] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes in seconds
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
  }, [order.payout_wallet]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        body: JSON.stringify({ order_id: order.id, tx_hash: txHash }),
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
            {t("Payment session expired. Please refresh the page to try again.")}
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
              : isPaymentBlocked
              ? "pointer-events-none opacity-40 blur-[1px] select-none cursor-not-allowed"
              : "opacity-100 blur-0"
          }`}
        >
          <button
            onClick={() => setMethod("wallet")}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm hover:border-brand hover:bg-brand-soft"
            disabled={balance === null || isChecking || isPaymentBlocked}
          >
            <span className="font-medium text-ink">{t("Pay with wallet")}</span>
            <span className="font-mono text-sm" dir="ltr">{t("{amount} balance", { amount: `$${(balance ?? 0).toFixed(2)}` })}</span>
          </button>
          <button
            onClick={() => setMethod("onchain")}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm hover:border-brand hover:bg-brand-soft"
            disabled={isChecking || isPaymentBlocked}
          >
            <span className="font-medium text-ink">{t("USDT (BEP20) deposit")}</span>
            <span className="text-muted">{t("Pay on-chain")}</span>
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
            disabled={busy || !canPayWithBalance}
            className="flex-1"
          >
            {busy ? t("Processing…") : t("Confirm")}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const exactAmount = Number(order.total).toFixed(4);

  return (
    <div className="space-y-5 text-sm">
      <LinkButton onClick={() => setMethod(null)}>{t("← Change payment method")}</LinkButton>

      {buffCheck?.is_buff && !buffCheck.affordable && (
        <Alert variant="error">
          {buffCheck.max_qty > 0
            ? t("You can order up to {n}B tokens right now. Please lower your quantity.", { n: buffCheck.max_qty })
            : t("Temporarily unavailable right now. Please check back soon.")}
        </Alert>
      )}

      {/* Step 1 — send */}
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <StepBadge n={1} />
          <h3 className="font-semibold text-ink">{t("Send exactly this amount")}</h3>
        </header>

        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-brand-soft p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("Amount to send")}</p>
            <p className="mt-1 font-mono text-3xl font-semibold text-ink">
              {exactAmount} <span className="text-base font-medium text-muted">USDT</span>
            </p>
            <CopyButton value={exactAmount} label={t("Copy amount")} className="mt-3" />
            <p className="mt-2 text-xs text-muted">
              {t("Send this exact figure, including every decimal. It is how we match your payment.")}
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={t("QR code for the payout wallet address")}
                className="h-36 w-36 flex-shrink-0 rounded-lg border border-border bg-white p-1"
              />
            )}
            <div className="w-full flex-1 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("Wallet address")}
              </p>
              <p dir="ltr" className="break-all rounded-lg border border-border bg-bg p-3 font-mono text-xs text-ink">
                {order.payout_wallet}
              </p>
              <CopyButton value={order.payout_wallet} label={t("Copy address")} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
            <span className="text-muted">{t("Network")}</span>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              BEP20 (BNB Smart Chain)
            </span>
          </div>

          <Alert variant="warning">
            {t("Send only USDT on BEP20. Other tokens or networks will be lost, and an amount that differs from the one above can't be matched to your order.")}
          </Alert>
        </div>
      </section>

      {/* Step 2 — verify */}
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <StepBadge n={2} />
          <h3 className="font-semibold text-ink">{t("Paste your transaction hash")}</h3>
        </header>
        <div className="space-y-3 p-4">
          <FormInput
            value={txHash}
            onChange={(e) => setTxHash(e.target.value.trim())}
            placeholder="0x…"
            className="font-mono !text-xs" dir="ltr"
            hint={t("After sending, copy the transaction hash (TxID) from your wallet or exchange.")}
            aria-label={t("Transaction hash")}
            autoComplete="off"
            spellCheck={false}
          />
          <Alert variant="error">{error}</Alert>
          <PrimaryButton onClick={submitPayment} disabled={!txHash || busy} className="w-full">
            {busy ? t("Checking the blockchain…") : t("I've sent it — verify payment")}
          </PrimaryButton>
          <p className="text-center text-xs text-muted">
            {t("Confirmation usually takes under a minute. If it says \"not visible yet\", wait a moment and try again — your payment is safe.")}
          </p>
        </div>
      </section>
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
      return t("That transaction wasn't a USDT (BEP20) transfer to our wallet.");
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
