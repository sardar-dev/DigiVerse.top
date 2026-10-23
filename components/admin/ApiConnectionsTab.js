import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton, DangerButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { FormInput, FormSelect, FormTextarea } from "../ui/FormInput";
import { LoadingState } from "../ui/States";

const EMPTY = {
  id: "",
  label: "",
  website: "",
  docs_url: "",
  docs: "",
  quick_start: "",
  base_url: "",
  auth_type: "",
  auth_header: "",
  auth_prefix: "",
  api_key: "",
  extra_headers: "",
  config: "",
};

const ERR = {
  run_migration_021: "Run supabase/migration_021_api_connections_withdrawals_stats.sql in the Supabase SQL editor first.",
  ai_not_configured: "Add GEMINI_API_KEY in Vercel environment variables and redeploy.",
  ai_rate_limited: "Gemini free limit reached. Wait a minute and try again.",
  ai_failed: "Gemini could not answer right now. Try again, or fill the settings by hand.",
  has_products: "This API still has products on your store. Disable it instead of deleting.",
};

const post = async (body) =>
  (
    await fetch("/api/admin/custom-suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();

// Add any reseller API without code: paste what you have (docs, quick
// start, key), let AI draft the settings, test against the real API, save.
export default function ApiConnectionsTab({ onChanged }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState(null); // form; null = list view
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [research, setResearch] = useState(null);
  const [test, setTest] = useState(null);

  async function load() {
    const d = await (await fetch("/api/admin/custom-suppliers")).json();
    setData(d);
  }
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const say = (type, text) => setMsg({ type, text });
  const errText = (d) => ERR[d.error] || d.detail || d.error || "Something went wrong.";

  function openNew() {
    setF({ ...EMPTY });
    setResearch(null);
    setTest(null);
    setMsg({ type: "", text: "" });
  }
  function openEdit(s) {
    setF({
      ...EMPTY,
      id: s.id,
      label: s.label,
      base_url: s.base_url,
      auth_type: s.auth_type,
      auth_header: s.auth_header || "",
      auth_prefix: s.auth_prefix || "",
      extra_headers: Object.keys(s.extra_headers || {}).length ? JSON.stringify(s.extra_headers, null, 2) : "",
      docs: s.docs || "",
      config: JSON.stringify(s.config || {}, null, 2),
      key_hint: s.key_hint,
    });
    setResearch(null);
    setTest(null);
    setMsg({ type: "", text: "" });
  }

  async function runResearch(feedback) {
    setBusy("research");
    say("", "");
    const d = await post({ action: "research", ...f, ...(feedback ? { feedback } : {}) });
    setBusy("");
    if (!d.success) return say("error", errText(d));
    setResearch(d);
    setF((x) => ({
      ...x,
      label: x.label || d.label,
      base_url: x.base_url || d.base_url,
      auth_type: x.auth_type || d.auth_type,
      auth_header: x.auth_header || d.auth_header,
      auth_prefix: x.auth_prefix || d.auth_prefix,
      extra_headers: x.extra_headers || (Object.keys(d.extra_headers || {}).length ? JSON.stringify(d.extra_headers, null, 2) : ""),
      config: JSON.stringify(d.config, null, 2),
    }));
    setTest(null);
    say("success", "Draft ready. Check the settings, then press Test connection.");
  }

  async function runTest() {
    setBusy("test");
    say("", "");
    const d = await post({ action: "test", ...f });
    setBusy("");
    if (!d.success) return say("error", errText(d));
    setTest(d.result);
  }

  async function save() {
    setBusy("save");
    const d = await post({ action: "save", ...f });
    setBusy("");
    if (!d.success) return say("error", errText(d));
    setF(null);
    say("success", "Saved. Open Products and press Sync to bring in its products.");
    load();
    onChanged && onChanged();
  }

  async function toggle(s) {
    await post({ action: "toggle", id: s.id, enabled: !s.enabled });
    load();
  }
  async function remove(s) {
    if (!window.confirm(`Delete ${s.label}?`)) return;
    const d = await post({ action: "delete", id: s.id });
    if (!d.success) say("error", errText(d));
    load();
  }

  if (!data) return <LoadingState label="Loading…" />;

  // ── form ──
  if (f) {
    const hasDocs = f.docs.trim() || f.docs_url.trim() || f.quick_start.trim();
    return (
      <div className="space-y-6">
        <button type="button" onClick={() => setF(null)} className="text-sm text-brand hover:underline">
          ← All connections
        </button>
        <SectionHeading
          title={f.id ? `Edit ${f.label}` : "Add an API"}
          description="Give what you have. AI reads it and drafts the settings; you test and save. Your API key is never sent to the AI."
        />
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="Name" value={f.label} onChange={set("label")} placeholder="e.g. FastAccounts" />
            <FormInput label="Website (optional)" value={f.website} onChange={set("website")} placeholder="https://…" />
          </div>
          <FormInput
            label="Documentation link (optional)"
            value={f.docs_url}
            onChange={set("docs_url")}
            placeholder="https://provider.com/api-docs"
            hint="If the page is blank or JS-only, paste the text below instead."
          />
          <FormTextarea
            label="Full API documentation (paste)"
            value={f.docs}
            onChange={set("docs")}
            rows={7}
            placeholder="Paste endpoints, example requests and example JSON responses…"
          />
          <FormTextarea
            label="Quick start (paste)"
            value={f.quick_start}
            onChange={set("quick_start")}
            rows={4}
            placeholder={'e.g. curl -H "Authorization: Bearer KEY" https://api.site.com/v1/products'}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="Base URL" value={f.base_url} onChange={set("base_url")} placeholder="https://api.provider.com/v1" />
            <FormInput
              label="API key"
              type="password"
              value={f.api_key}
              onChange={set("api_key")}
              autoComplete="off"
              placeholder={f.key_hint ? `${f.key_hint} (leave blank to keep)` : "Paste the key"}
            />
            <FormSelect label="Auth type" value={f.auth_type} onChange={set("auth_type")}>
              <option value="">Let AI decide</option>
              <option value="bearer">Bearer token (Authorization: Bearer …)</option>
              <option value="header">Custom header (e.g. X-API-Key)</option>
              <option value="query">Key in URL (?api_key=…)</option>
              <option value="basic">Basic auth</option>
              <option value="none">None</option>
            </FormSelect>
            <FormInput
              label="Auth header / parameter name"
              value={f.auth_header}
              onChange={set("auth_header")}
              placeholder="X-API-Key (only for custom header / URL key)"
            />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">More auth options</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <FormInput label="Value prefix" value={f.auth_prefix} onChange={set("auth_prefix")} placeholder="Token " />
              <FormTextarea label="Extra headers (JSON)" value={f.extra_headers} onChange={set("extra_headers")} rows={2} placeholder='{"X-Client":"digiverse"}' />
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton onClick={() => runResearch()} disabled={busy !== "" || !(f.label || hasDocs)}>
              {busy === "research" ? "Researching… (up to a minute)" : hasDocs ? "Draft settings with AI" : "Research it for me (web search)"}
            </PrimaryButton>
            {!data.configured && <span className="text-xs text-danger">{ERR.ai_not_configured}</span>}
          </div>

          {research && (
            <div className="rounded-lg bg-brand-soft p-3 text-xs text-ink">
              <div className="font-medium">
                AI confidence: {research.confidence}
                {research.searched ? " (used web search)" : ""} · model {research.model}
              </div>
              {research.notes?.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {research.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              {research.sources?.length > 0 && (
                <div className="mt-1 break-all text-muted">Sources: {research.sources.join(" · ")}</div>
              )}
            </div>
          )}

          <FormTextarea
            label="Connection settings (JSON, filled by AI)"
            value={f.config}
            onChange={set("config")}
            rows={16}
            className="font-mono text-xs"
            hint="Endpoints, where id/title/price/stock sit in the response, and how to place an order. You can edit it by hand."
          />

          <Alert variant={msg.type === "success" ? "success" : "error"}>{msg.text}</Alert>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={runTest} disabled={busy !== "" || !f.config.trim() || !f.base_url.trim()}>
              {busy === "test" ? "Testing…" : "Test connection"}
            </SecondaryButton>
            <PrimaryButton onClick={save} disabled={busy !== "" || !f.config.trim() || !f.label.trim()}>
              {busy === "save" ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>

          {test && <TestResult t={test} onFix={() => runResearch(JSON.stringify(test))} busy={busy} />}
        </div>
      </div>
    );
  }

  // ── list ──
  return (
    <div className="space-y-6">
      <SectionHeading
        title="API connections"
        description="Suppliers you added yourself. DigiTrust and XPro are set up through environment variables."
        action={<PrimaryButton onClick={openNew}>Add an API</PrimaryButton>}
      />
      <Alert variant={msg.type === "success" ? "success" : "error"}>{msg.text}</Alert>
      {data.error && <Alert variant="error">{ERR[data.error] || data.error}</Alert>}
      {data.suppliers.length === 0 && !data.error && (
        <p className="text-sm text-muted">No custom APIs yet. Press “Add an API”.</p>
      )}
      <ul className="space-y-3">
        {data.suppliers.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-ink">
                  {s.label}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${s.enabled ? "bg-success-soft text-success" : "bg-border text-muted"}`}>
                    {s.enabled ? "On" : "Off"}
                  </span>
                </div>
                <div className="break-all text-xs text-muted">
                  {s.base_url} · {s.auth_type} · key {s.key_hint || "none"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <SecondaryButton onClick={() => openEdit(s)} className="px-3 py-1.5 text-xs">Edit / test</SecondaryButton>
                <SecondaryButton onClick={() => toggle(s)} className="px-3 py-1.5 text-xs">{s.enabled ? "Turn off" : "Turn on"}</SecondaryButton>
                <DangerButton onClick={() => remove(s)} className="px-3 py-1.5 text-xs">Delete</DangerButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TestResult({ t, onFix, busy }) {
  const ok = t.list?.ok;
  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg p-4 text-sm">
      <div className="font-semibold text-ink">Test result</div>
      {t.list?.error ? (
        <p className="text-danger">Product list failed: {t.list.error}</p>
      ) : (
        <>
          <p className={ok ? "text-success" : "text-warning"}>
            {ok ? `Found ${t.list.count} product(s) on the first page` : "No usable products found"}
            {t.list.skipped ? ` (${t.list.skipped} rows skipped: no id or price)` : ""}
          </p>
          {t.list.sample?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted">
                  <tr><th className="pr-3">ID</th><th className="pr-3">Title</th><th className="pr-3">Cost</th><th>Stock</th></tr>
                </thead>
                <tbody>
                  {t.list.sample.map((p) => (
                    <tr key={p.id}>
                      <td className="pr-3 font-mono">{p.id}</td>
                      <td className="pr-3">{p.title}</td>
                      <td className="pr-3 font-mono">${Number(p.cost).toFixed(2)}</td>
                      <td className="font-mono">{p.stockKnown ? p.stock : `${p.stock} (assumed)`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!ok && t.list.rawFirst && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface p-2 text-xs text-muted">
              {t.list.topKeys?.length ? `Top-level keys: ${t.list.topKeys.join(", ")}\n` : ""}First row: {t.list.rawFirst}
            </pre>
          )}
        </>
      )}
      {t.product && (
        <p className={t.product.ok ? "text-success" : "text-danger"}>
          Single product check: {t.product.ok ? `ok (cost $${Number(t.product.cost).toFixed(2)}, stock ${t.product.stock})` : t.product.error}
        </p>
      )}
      {t.balance && !t.balance.skipped && (
        <p className={t.balance.ok ? "text-success" : "text-danger"}>
          Balance: {t.balance.ok ? `$${Number(t.balance.value).toFixed(2)}` : t.balance.error || `not found (${t.balance.raw})`}
        </p>
      )}
      {(!ok || t.product?.ok === false || t.balance?.ok === false) && (
        <SecondaryButton onClick={onFix} disabled={busy !== ""}>
          {busy === "research" ? "Asking AI…" : "Ask AI to fix the settings using this result"}
        </SecondaryButton>
      )}
      <p className="text-xs text-muted">Ordering is not tested (it would spend money). Try one cheap real order after saving.</p>
    </div>
  );
}
