import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { FormInput, FormSelect } from "../ui/FormInput";
import { LoadingState } from "../ui/States";

const money = (n) => `$${Number(n).toFixed(2)}`;
// Same formula as the server (lib/pricing.js), for the live preview.
function sellFor(cost, r) {
  const raw = r.mode === "fixed" ? cost + Number(r.value) : cost * (1 + Number(r.value) / 100);
  const units = Math.ceil(Math.round((raw / 0.05) * 1e6) / 1e6);
  return Math.max(0.05, Math.round(units * 0.05 * 100) / 100);
}
const post = async (body) =>
  (await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

// Set your profit once; prices follow the supplier's cost up AND down.
export default function PricingTab({ onChanged }) {
  const [d, setD] = useState(null);
  const [rule, setRule] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });

  async function load() {
    const r = await (await fetch("/api/admin/pricing")).json();
    setD(r);
    if (r.rule) setRule((x) => x || r.rule);
  }
  useEffect(() => {
    load();
  }, []);

  if (!d || !rule) return <LoadingState label="Loading pricing…" />;
  const set = (k) => (e) => setRule((x) => ({ ...x, [k]: e.target.value }));

  async function save(enabled = rule.enabled) {
    setBusy("save");
    const r = await post({ action: "save", rule: { ...rule, enabled } });
    setBusy("");
    if (!r.success) return setMsg({ type: "error", text: r.error });
    setRule(r.rule);
    setMsg({ type: "success", text: enabled ? "Saved. Auto-pricing is ON: it applies at every sync." : "Saved. Auto-pricing is OFF." });
    load();
  }
  async function run(action, ok) {
    setBusy(action);
    const r = await post({ action });
    setBusy("");
    if (!r.success) return setMsg({ type: "error", text: r.error });
    setMsg({ type: "success", text: `${ok}: ${r.changed} of ${r.total} product(s) changed.` });
    load();
    onChanged && onChanged();
  }

  const preview = (d.sample || []).map((p) => ({ ...p, planned: sellFor(p.cost, rule) }));
  const exampleCost = 0.6;
  const exSell = sellFor(exampleCost, rule);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Pricing & profit"
        description="Choose the profit you want. Your prices then move with the supplier's cost, up and down, keeping that profit."
      />
      {!d.migrated && <Alert variant="warning">Run supabase/migration_023_auto_pricing.sql first.</Alert>}

      <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-ink">Auto-pricing (master switch)</div>
            <div className="text-xs text-muted">Only products you tick "Auto" on in Products follow this rule. Nothing else changes.</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${rule.enabled ? "bg-success-soft text-success" : "bg-border text-muted"}`}>
            {rule.enabled ? "ON" : "OFF"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect label="Profit type" value={rule.mode} onChange={set("mode")}>
            <option value="percent">Percentage of cost (%)</option>
            <option value="fixed">Fixed amount ($)</option>
          </FormSelect>
          <FormInput
            label={rule.mode === "percent" ? "Profit %" : "Profit $ per item"}
            type="number"
            min="0"
            step="0.01"
            value={rule.value}
            onChange={set("value")}
          />
        </div>

        <p className="rounded-lg bg-brand-soft p-3 text-sm text-ink">
          Prices always round UP to the next $0.05 (never down). Example: supplier charges <b>{money(exampleCost)}</b> → you sell at <b>{money(exSell)}</b> (profit {money(exSell - exampleCost)}).
          If the supplier goes to $0.80 → {money(sellFor(0.8, rule))}; if it drops to $0.50 → {money(sellFor(0.5, rule))}.
        </p>

        <Alert variant={msg.type === "success" ? "success" : "error"}>{msg.text}</Alert>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => save(true)} disabled={busy !== ""}>
            {busy === "save" ? "Saving…" : rule.enabled ? "Save changes" : "Save and turn ON"}
          </PrimaryButton>
          {rule.enabled && (
            <SecondaryButton onClick={() => save(false)} disabled={busy !== ""}>Turn OFF</SecondaryButton>
          )}
          <SecondaryButton onClick={() => run("apply", "Updated now")} disabled={busy !== "" || !d.rule.enabled}>
            {busy === "apply" ? "Updating…" : "Apply to all now"}
          </SecondaryButton>
        </div>
        <p className="text-xs text-muted">
          Prices re-check at every sync (daily, or whenever you press Sync) and right away when a customer's checkout sees a supplier price change.
          Save first, then press "Apply to all now" to update immediately.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Preview (auto-priced products)</h3>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Supplier cost</th>
                <th className="px-4 py-2.5 text-right">Your price now</th>
                <th className="px-4 py-2.5 text-right">With this rule</th>
                <th className="px-4 py-2.5 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-ink">{p.title}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(p.cost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted">{money(p.sell)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium">{money(p.planned)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-success">{money(p.planned - p.cost)}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-3 text-muted">No product is on Auto yet. Tick "Auto" in Products.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="max-w-2xl rounded-xl border border-border bg-surface p-5 shadow-card text-sm text-ink">
        <b>{d.auto}</b> product(s) are on auto-pricing. Go to <b>Products</b> and tick <b>Auto</b> on the ones you want. Everything else keeps its own price.
      </div>
    </div>
  );
}
