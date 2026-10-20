import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabaseClient";
import Alert from "./ui/Alert";
import { PrimaryButton, SecondaryButton, LinkButton } from "./ui/Button";
import { FormInput } from "./ui/FormInput";
import CopyButton, { StepBadge } from "./ui/CopyButton";

// Used both in the checkout modal (fresh order) and on /account/orders
// (resuming a payment after a closed tab / refresh / lost connection).
// order needs: { id, total, payout_wallet }. Calls onDone(items) once
// the order is fulfilled.
export default function PaymentPanel({ order, onDone }) {
  const [method, setMethod] = useState(null); // 'wallet' | 'onchain' | null
  const [balance, setBalance] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

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

  const canPayWithBalance = balance !== null && balance >= Number(order.total);

  async function payWithBalance() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/orders/pay-with-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      onDone({ items: data.items, manual: data.manual });
    } else {
      setError(describeError(data.error, data));
    }
  }

  async function submitPayment() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/orders/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order.id, tx_hash: txHash }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      onDone({ items: data.items, manual: data.manual });
    } else {
      setError(describeError(data.error, data));
    }
  }

  if (!method) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Choose how to pay</p>
        {canPayWithBalance && (
          <button
            onClick={() => setMethod("wallet")}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm hover:border-brand hover:bg-brand-soft"
          >
            <span className="font-medium text-ink">Wallet balance</span>
            <span className="font-mono text-muted">${balance.toFixed(2)} available</span>
          </button>
        )}
        <button
          onClick={() => setMethod("onchain")}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm hover:border-brand hover:bg-brand-soft"
        >
          <span className="font-medium text-ink">USDT (BEP20) deposit</span>
          <span className="text-muted">Pay on-chain</span>
        </button>
      </div>
    );
  }

  if (method === "wallet") {
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex justify-between py-1">
            <span className="text-muted">Available balance</span>
            <span className="font-mono text-ink">${(balance ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted">Order amount</span>
            <span className="font-mono text-ink">${Number(order.total).toFixed(2)}</span>
          </div>
        </div>
        {!canPayWithBalance && (
          <Alert variant="warning">Insufficient wallet balance for this order.</Alert>
        )}
        <Alert variant="error">{error}</Alert>
        <div className="flex gap-3">
          <SecondaryButton onClick={() => setMethod(null)} className="flex-1">
            Back
          </SecondaryButton>
          <PrimaryButton
            onClick={payWithBalance}
            disabled={busy || !canPayWithBalance}
            className="flex-1"
          >
            {busy ? "Processing…" : "Confirm"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const exactAmount = Number(order.total).toFixed(4);

  return (
    <div className="space-y-5 text-sm">
      <LinkButton onClick={() => setMethod(null)}>← Change payment method</LinkButton>

      {/* Step 1 — send */}
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <StepBadge n={1} />
          <h3 className="font-semibold text-ink">Send exactly this amount</h3>
        </header>

        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-brand-soft p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Amount to send</p>
            <p className="mt-1 font-mono text-3xl font-semibold text-ink">
              {exactAmount} <span className="text-base font-medium text-muted">USDT</span>
            </p>
            <CopyButton value={exactAmount} label="Copy amount" className="mt-3" />
            <p className="mt-2 text-xs text-muted">
              Send this exact figure, including every decimal. It is how we match your payment.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR code for the payout wallet address"
                className="h-36 w-36 flex-shrink-0 rounded-lg border border-border bg-white p-1"
              />
            )}
            <div className="w-full flex-1 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Wallet address
              </p>
              <p className="break-all rounded-lg border border-border bg-bg p-3 font-mono text-xs text-ink">
                {order.payout_wallet}
              </p>
              <CopyButton value={order.payout_wallet} label="Copy address" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
            <span className="text-muted">Network</span>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              BEP20 (BNB Smart Chain)
            </span>
          </div>

          <Alert variant="warning">
            Send only <strong>USDT on BEP20</strong>. Other tokens or networks will be lost, and an
            amount that differs from the one above can't be matched to your order.
          </Alert>
        </div>
      </section>

      {/* Step 2 — verify */}
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <StepBadge n={2} />
          <h3 className="font-semibold text-ink">Paste your transaction hash</h3>
        </header>
        <div className="space-y-3 p-4">
          <FormInput
            value={txHash}
            onChange={(e) => setTxHash(e.target.value.trim())}
            placeholder="0x…"
            className="font-mono !text-xs"
            hint="After sending, copy the transaction hash (TxID) from your wallet or exchange."
            aria-label="Transaction hash"
            autoComplete="off"
            spellCheck={false}
          />
          <Alert variant="error">{error}</Alert>
          <PrimaryButton onClick={submitPayment} disabled={!txHash || busy} className="w-full">
            {busy ? "Checking the blockchain…" : "I've sent it — verify payment"}
          </PrimaryButton>
          <p className="text-center text-xs text-muted">
            Confirmation usually takes under a minute. If it says "not visible yet", wait a moment
            and try again — your payment is safe.
          </p>
        </div>
      </section>
    </div>
  );
}

function describeError(code, data) {
  switch (code) {
    case "too_many_attempts":
      return `Too many wrong transaction hashes. Please wait ${Math.max(
        1,
        Math.ceil(((data && data.retry_after) || 120) / 60)
      )} minute(s) and double-check the hash before trying again.`;
    case "not_found_yet":
      return "That transaction isn't visible on-chain yet — wait a bit and try again.";
    case "chain_lookup_failed":
      return "Couldn't reach the blockchain right now — try again in a moment.";
    case "tx_failed":
      return "That transaction failed on-chain — it never went through.";
    case "wrong_recipient":
      return "That transaction wasn't a USDT (BEP20) transfer to our wallet.";
    case "amount_too_low":
      return "The amount received doesn't match the order total.";
    case "awaiting_confirmations":
      return "Payment seen, waiting for more confirmations — try again shortly.";
    case "tx_already_used":
      return "That transaction hash was already used on another order.";
    case "insufficient_balance":
      return "Not enough wallet balance for this order.";
    case "out_of_stock_refund_pending":
      return "Sold out at the last moment — your payment will be refunded manually, sorry.";
    case "fulfillment_uncertain_pending_review":
      return "Payment received — we're double-checking delivery, this may take a few minutes.";
    default:
      return code ? code.replaceAll("_", " ") : "";
  }
}
