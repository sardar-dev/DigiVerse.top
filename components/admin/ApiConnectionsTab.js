import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { PrimaryButton, SecondaryButton, DangerButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { FormInput, FormSelect, FormTextarea } from "../ui/FormInput";
import { LoadingState } from "../ui/States";

const EMPTY = {
  id: "",
  label: "",
  base_url: "",
  api_key: "",
  auth_type: "bearer",
  auth_header: "",
  auth_prefix: "",
  extra_headers: "",
  key_hint: "",
  // Endpoint paths
  products_path: "/?action=products",
  balance_path: "/?action=balance",
  order_path: "/?action=order",
  // Product field mappings
  items_path: "",
  field_id: "id",
  field_title: "name",
  field_price: "price",
  field_stock: "stock",
  // Balance / order response fields
  balance_field: "balance",
  order_items_path: "items",
  order_id_path: "order_id",
  // Advanced (AI / raw JSON)
  config: "",
  docs: "",
  docs_url: "",
  quick_start: "",
  website: "",
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

// Builds the config JSON the backend expects from the simple form fields.
function buildConfig(f) {
  const cfg = {
    list: {
      path: (f.products_path || "/?action=products").trim(),
      items_path: (f.items_path || "").trim(),
      map: {
        id: (f.field_id || "id").trim(),
        title: (f.field_title || "name").trim(),
        price: (f.field_price || "price").trim(),
        ...(f.field_stock?.trim() ? { stock: f.field_stock.trim() } : {}),
      },
    },
  };
  if (f.balance_path?.trim()) {
    cfg.balance = {
      path: f.balance_path.trim(),
      value_path: (f.balance_field || "balance").trim(),
    };
  }
  if (f.order_path?.trim()) {
    cfg.purchase = {
      method: "POST",
      path: f.order_path.trim(),
      body: {
        product_id: "{{product_id}}",
        quantity: "{{quantity|number}}",
        external_order_id: "{{order_id}}",
      },
      items_path: (f.order_items_path || "items").trim(),
      order_id_path: (f.order_id_path || "order_id").trim(),
    };
  }
  return JSON.stringify(cfg, null, 2);
}

// Parses an existing config JSON back into simple form fields for editing.
function parseConfigToSimple(config) {
  try {
    const c = typeof config === "string" ? JSON.parse(config) : config;
    if (!c || typeof c !== "object") return {};
    return {
      products_path: c.list?.path || "/?action=products",
      items_path: c.list?.items_path || "",
      field_id: c.list?.map?.id || "id",
      field_title: c.list?.map?.title || "name",
      field_price: c.list?.map?.price || "price",
      field_stock: c.list?.map?.stock || "",
      balance_path: c.balance?.path || "/?action=balance",
      balance_field: c.balance?.value_path || "balance",
      order_path: c.purchase?.path || "/?action=order",
      order_items_path: c.purchase?.items_path || "items",
      order_id_path: c.purchase?.order_id_path || "order_id",
    };
  } catch {
    return {};
  }
}

export default function ApiConnectionsTab({ onChanged }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState(null); // form state; null = list view
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [research, setResearch] = useState(null);
  const [test, setTest] = useState(null);

  async function load() {
    const d = await (await fetch("/api/admin/custom-suppliers")).json();
    setData(d);
  }
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const say = (type, text) => setMsg({ type, text });
  const errText = (d) => ERR[d.error] || d.detail || d.error || "Something went wrong.";

  // Use raw config JSON if user typed in it (Advanced), else build from simple fields.
  const getConfig = (form) => (form.config?.trim() ? form.config : buildConfig(form));

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
      auth_type: s.auth_type || "bearer",
      auth_header: s.auth_header || "",
      auth_prefix: s.auth_prefix || "",
      extra_headers: Object.keys(s.extra_headers || {}).length ? JSON.stringify(s.extra_headers, null, 2) : "",
      docs: s.docs || "",
      key_hint: s.key_hint || "",
      config: "", // Simple fields are the source of truth; raw JSON starts empty
      ...parseConfigToSimple(s.config),
    });
    setResearch(null);
    setTest(null);
    setMsg({ type: "", text: "" });
  }

  async function runResearch(feedback) {
    setBusy("research");
    say("", "");
    const d = await post({
      action: "research",
      ...f,
      config: getConfig(f),
      ...(feedback ? { feedback } : {}),
    });
    setBusy("");
    if (!d.success) return say("error", errText(d));
    setResearch(d);
    const configStr = JSON.stringify(d.config, null, 2);
    setF((x) => ({
      ...x,
      label: x.label || d.label || "",
      base_url: x.base_url || d.base_url || "",
      auth_type: x.auth_type || d.auth_type || "bearer",
      auth_header: x.auth_header || d.auth_header || "",
      auth_prefix: x.auth_prefix || d.auth_prefix || "",
      extra_headers: x.extra_headers || (Object.keys(d.extra_headers || {}).length ? JSON.stringify(d.extra_headers, null, 2) : ""),
      config: configStr,
      ...parseConfigToSimple(d.config),
    }));
    setTest(null);
    say("success", "Draft ready — check the settings below, then press Test.");
  }

  async function runTest() {
    setBusy("test");
    say("", "");
    const d = await post({ action: "test", ...f, config: getConfig(f) });
    setBusy("");
    if (!d.success) return say("error", errText(d));
    setTest(d.result);
  }

  async function save() {
    setBusy("save");
    const d = await post({ action: "save", ...f, config: getConfig(f) });
    setBusy("");
    if (!d.success) return say("error", errText(d));
    setF(null);
    say("success", "Saved. Open Products and press Sync to bring in its products.");
    load();
    onChanged?.();
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

  // ── Form view ──
  if (f) {
    const hasKey = f.auth_type === "none" || f.api_key.trim() || f.key_hint;
    const canAct = busy === "" && f.base_url.trim() && hasKey;
    const canSave = busy === "" && f.label.trim() && f.base_url.trim() && hasKey;
    const hasDocs = f.docs.trim() || f.docs_url.trim() || f.quick_start.trim();

    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setF(null)} className="text-sm text-brand hover:underline">
          ← All connections
        </button>
        <SectionHeading
          title={f.id ? `Edit ${f.label}` : "Add a supplier API"}
          description="Fill in your supplier's details — you can find these in their developer / API page."
        />

        {/* ── Step 1: Basic info ── */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step 1 — Supplier info</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Supplier name"
              value={f.label}
              onChange={set("label")}
              placeholder="e.g. FastAccounts"
            />
            <FormInput
              label="Endpoint URL"
              value={f.base_url}
              onChange={set("base_url")}
              placeholder="https://supplier.com/api/reseller"
              hint="The base URL shown in your supplier's API docs."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="API key"
              type="password"
              value={f.api_key}
              onChange={set("api_key")}
              autoComplete="off"
              placeholder={f.key_hint ? `${f.key_hint}  (leave blank to keep)` : "Paste your API key here"}
            />
            <FormSelect label="Authentication type" value={f.auth_type} onChange={set("auth_type")}>
              <option value="bearer">Bearer token  (most common)</option>
              <option value="header">Custom header  (X-API-Key, etc.)</option>
              <option value="query">Key in URL  (?api_key=…)</option>
              <option value="basic">Basic auth</option>
              <option value="none">No authentication</option>
            </FormSelect>
          </div>
          {(f.auth_type === "header" || f.auth_type === "query") && (
            <FormInput
              label={f.auth_type === "header" ? "Header name" : "Parameter name"}
              value={f.auth_header}
              onChange={set("auth_header")}
              placeholder={f.auth_type === "header" ? "X-API-Key" : "api_key"}
            />
          )}
        </div>

        {/* ── Step 2: Endpoint paths ── */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step 2 — API endpoints</p>
          <p className="text-xs text-muted">
            Copy these paths exactly from your supplier's docs. They are added after the endpoint URL above.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormInput
              label="Products list"
              value={f.products_path}
              onChange={set("products_path")}
              placeholder="/?action=products"
              hint="GET — lists all products"
            />
            <FormInput
              label="Balance check"
              value={f.balance_path}
              onChange={set("balance_path")}
              placeholder="/?action=balance"
              hint="GET — optional"
            />
            <FormInput
              label="Place order"
              value={f.order_path}
              onChange={set("order_path")}
              placeholder="/?action=order"
              hint="POST — to buy a product"
            />
          </div>
        </div>

        {/* ── Step 3: Product field names ── */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step 3 — Product field names</p>
          <p className="text-xs text-muted">
            What are the JSON key names in the products response? Leave the defaults and press Test first — fix only if needed.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Products array path"
              value={f.items_path}
              onChange={set("items_path")}
              placeholder="data  (leave blank if response itself is the array)"
              hint="Where the array of products sits in the JSON response."
            />
            <FormInput
              label="Balance field name"
              value={f.balance_field}
              onChange={set("balance_field")}
              placeholder="balance"
              hint="Field name in the balance response."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <FormInput label="Product ID field" value={f.field_id} onChange={set("field_id")} placeholder="id" />
            <FormInput label="Name / title field" value={f.field_title} onChange={set("field_title")} placeholder="name" />
            <FormInput label="Price field" value={f.field_price} onChange={set("field_price")} placeholder="price" />
            <FormInput label="Stock field" value={f.field_stock} onChange={set("field_stock")} placeholder="stock  (optional)" />
          </div>
        </div>

        {/* ── Step 4: Order response ── */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step 4 — Order response fields</p>
          <p className="text-xs text-muted">
            After placing an order, where does the supplier return the delivery content and order reference?
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Delivery items field"
              value={f.order_items_path}
              onChange={set("order_items_path")}
              placeholder="items"
              hint="Array of keys / accounts delivered to the customer."
            />
            <FormInput
              label="Order ID field"
              value={f.order_id_path}
              onChange={set("order_id_path")}
              placeholder="order_id"
              hint="The supplier's reference number for the order."
            />
          </div>
        </div>

        {/* ── Advanced ── */}
        <details className="rounded-xl border border-border bg-surface shadow-card">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-medium text-ink">
            ⚙️ Advanced — AI research &amp; raw settings JSON
          </summary>
          <div className="space-y-4 px-5 pb-5 pt-1">
            <p className="text-xs text-muted">
              Paste your supplier's API docs to let AI auto-fill the steps above. Or edit the raw JSON directly.
              If the JSON box below has content, it overrides all steps above.
            </p>
            <FormInput
              label="Docs URL (optional)"
              value={f.docs_url}
              onChange={set("docs_url")}
              placeholder="https://supplier.com/api-docs"
            />
            <FormTextarea
              label="Paste API docs (optional)"
              value={f.docs}
              onChange={set("docs")}
              rows={5}
              placeholder="Paste endpoints, authentication examples, sample JSON responses…"
            />
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={() => runResearch()} disabled={busy !== "" || !(f.label || hasDocs)}>
                {busy === "research" ? "Researching… (up to a minute)" : hasDocs ? "Draft settings with AI" : "Research it for me (web search)"}
              </PrimaryButton>
              {!data.configured && <span className="text-xs text-danger">{ERR.ai_not_configured}</span>}
            </div>
            {research && (
              <div className="rounded-lg bg-brand-soft p-3 text-xs text-ink">
                <span className="font-medium">AI confidence: {research.confidence}</span>
                {research.searched ? " (used web search)" : ""}
                {research.notes?.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {research.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                )}
              </div>
            )}
            <FormTextarea
              label="Raw settings JSON"
              value={f.config}
              onChange={set("config")}
              rows={12}
              className="font-mono text-xs"
              hint="Filled by AI after research. If non-empty, overrides the steps above. Clear to go back to simple mode."
            />
          </div>
        </details>

        <Alert variant={msg.type === "success" ? "success" : "error"}>{msg.text}</Alert>

        <div className="flex flex-wrap gap-3">
          <SecondaryButton onClick={runTest} disabled={!canAct}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </SecondaryButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {busy === "save" ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>

        {test && <TestResult t={test} onFix={() => runResearch(JSON.stringify(test))} busy={busy} />}
      </div>
    );
  }

  // ── List view ──
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
        <p className="text-sm text-muted">No custom APIs yet. Press "Add an API".</p>
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
