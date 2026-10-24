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
const LABEL = { pending: "Waiting", approved: "Paid", rejected: "Rejected, refunded" };

const METHODS = [
  { id: "usdt_bep20", icon: "🪙", name: "USDT", sub: "BEP20 network" },
  { id: "pkr_iban", icon: "🏦", name: "PKR bank", sub: "IBAN account" },
  { id: "binance", icon: "🟡", name: "Binance", sub: "Binance ID" },
];
const NAME = { usdt_bep20: "USDT (BEP20)", pkr_iban: "PKR bank (IBAN)", binance: "Binance ID" };

const ERR = {
  invalid_amount: "Enter an amount of at least $0.01.",
  invalid_address: "That does not look like a BEP20 address (0x… with 42 characters).",
  invalid_iban: "Enter a Pakistani IBAN: PK + 22 characters, for example PK36SCBL0000001123456702.",
  title_required: "Enter the account title (the name on the account).",
  invalid_binance: "Enter your Binance ID: digits only, 5 to 15 characters (Profile → Binance ID / Pay ID).",
  invalid_method: "Choose how you want to be paid.",
  insufficient_balance: "You do not have that much balance.",
  below_minimum: "That amount is too small.",
  too_many_pending: "You already have 3 requests waiting. Please wait for them to be processed.",
  run_migration_022: "Withdrawals are not available yet. Please try again later.",
};

const KEY = "dv_payout";
const readSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

export default function Withdraw() {
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [info, setInfo] = useState(null);
  const [method, setMethod] = useState("usdt_bep20");
  const [amount, setAmount] = useState("");
  const [f, setF] = useState({ usdt_bep20: "", pkr_iban: "", binance: "", account_title: "", bank_name: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    const saved = readSaved();
    if (saved.method) setMethod(saved.method);
    if (saved.f) setF((x) => ({ ...x, ...saved.f }));
    load();
  }, []);

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

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const value = method === "pkr_iban" ? f.pkr_iban : method === "binance" ? f.binance : f.usdt_bep20;
  const amt = Math.round(Number(amount) * 100) / 100;
  const tooMuch = balance !== null && amt > balance + 1e-9;
  const ready =
    amt >= 0.01 && !tooMuch && value.trim() && (method !== "pkr_iban" || f.account_title.trim().length >= 3);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: "", text: "" });
    const d = await (
      await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method, address: value, account_title: f.account_title, bank_name: f.bank_name }),
      })
    ).json();
    setBusy(false);
    if (d.success) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ method, f }));
      } catch {}
      setMsg({ type: "success", text: `Request #${d.request_number} sent. You'll be paid once it is approved.` });
      setAmount("");
      setBalance(d.balance);
      load();
    } else {
      setMsg({ type: "error", text: ERR[d.error] || "Something went wrong." });
    }
  }

  const waiting = (info?.requests || []).filter((w) => w.status === "pending");

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title="Withdraw" path="/account/withdraw" noindex />
      <SiteHeader session={session} balance={balance} onSignOut={() => supabase.auth.signOut()} />
      <main className="flex-1">
        <PageContainer className="space-y-6 py-8 sm:py-10" width="max-w-2xl">
          <Link href="/account/wallet" className="text-sm text-brand hover:underline">← Back to wallet</Link>

          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-card-hover">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
            <div className="relative flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm text-white/80">Available to withdraw</div>
                <div className="mt-1 text-4xl font-semibold tracking-tight">{balance === null ? "…" : `$${balance.toFixed(2)}`}</div>
              </div>
              {waiting.length > 0 && (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
                  {waiting.length} request{waiting.length > 1 ? "s" : ""} waiting
                </span>
              )}
            </div>
          </section>

          {!info && !msg.text && <LoadingState label="Loading…" />}

          <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <div>
              <div className="mb-2 text-sm font-medium">1. How do you want to be paid?</div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    aria-pressed={method === m.id}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      method === m.id ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-border hover:bg-brand-soft/60"
                    }`}
                  >
                    <div className="text-xl">{m.icon}</div>
                    <div className="mt-1 text-sm font-semibold">{m.name}</div>
                    <div className="text-[11px] leading-tight text-muted">{m.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-medium">2. Where should we send it?</div>
              {method === "usdt_bep20" && (
                <FormInput
                  label="USDT address (BEP20 / BNB Smart Chain)"
                  value={f.usdt_bep20}
                  onChange={set("usdt_bep20")}
                  placeholder="0x…"
                  className="font-mono text-xs"
                  autoComplete="off"
                  hint="Only BEP20. Funds sent to a wrong address or network cannot be recovered."
                />
              )}
              {method === "pkr_iban" && (
                <>
                  <FormInput
                    label="IBAN"
                    value={f.pkr_iban}
                    onChange={(e) => setF((x) => ({ ...x, pkr_iban: e.target.value.toUpperCase() }))}
                    placeholder="PK36SCBL0000001123456702"
                    className="font-mono text-sm"
                    autoComplete="off"
                    hint="Put your IBAN. Pakistani accounts only."
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormInput label="Account title" value={f.account_title} onChange={set("account_title")} placeholder="Name on the account" maxLength={60} />
                    <FormInput label="Bank name (optional)" value={f.bank_name} onChange={set("bank_name")} placeholder="e.g. HBL, Meezan, JazzCash" maxLength={40} />
                  </div>
                  <p className="text-xs text-muted">PKR is paid at the current exchange rate on the day it is processed.</p>
                </>
              )}
              {method === "binance" && (
                <FormInput
                  label="Binance ID (Pay ID)"
                  value={f.binance}
                  onChange={(e) => setF((x) => ({ ...x, binance: e.target.value.replace(/\D/g, "") }))}
                  placeholder="e.g. 123456789"
                  inputMode="numeric"
                  className="font-mono"
                  autoComplete="off"
                  hint="Binance app → Profile → Binance ID / Pay ID."
                />
              )}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">3. How much?</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <FormInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount in USD"
                    aria-label="Amount in USD"
                    error={tooMuch ? "More than your balance" : undefined}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => balance && setAmount(String(Math.floor(balance * 100) / 100))}
                  disabled={!balance}
                  className="h-[42px] rounded-lg border border-border px-4 text-sm font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                >
                  Max
                </button>
              </div>
              <p className="text-xs text-muted">No minimum. The amount leaves your balance now and returns if the request is rejected.</p>
            </div>

            {ready && (
              <div className="rounded-xl bg-brand-soft p-3 text-sm">
                You are withdrawing <b>${amt.toFixed(2)}</b> to <b>{NAME[method]}</b>
                <div className="mt-0.5 break-all font-mono text-xs text-muted">{value}</div>
              </div>
            )}

            <Alert variant={msg.type === "success" ? "success" : "error"}>{msg.text}</Alert>
            <PrimaryButton type="submit" disabled={busy || !ready} className="w-full">
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
                        <span className="text-xs text-muted">· {NAME[w.method] || "USDT (BEP20)"} · #{w.request_number}</span>
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[w.status]}`}>{LABEL[w.status]}</span>
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-muted">
                      {w.address}
                      {w.details?.account_title ? ` · ${w.details.account_title}` : ""}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{when(w.created_at)}</div>
                    {w.payout_tx && <div className="mt-1 break-all text-xs text-muted">Reference: {w.payout_tx}</div>}
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
