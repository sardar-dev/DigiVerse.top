import { useEffect, useState } from "react";
import DataTable from "./DataTable";
import SectionHeading from "../ui/SectionHeading";
import { FormInput, FormSelect } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton, DangerButton } from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/States";

const EMPTY = {
  code: "",
  discount_type: "percent",
  discount_value: "",
  product_ids: [],
  max_uses: "",
  per_user_limit: "1",
  min_order: "",
  expires_at: "",
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const ERRORS = {
  invalid_code_format: "Code must be 3–32 characters: letters, numbers, - or _.",
  code_already_exists: "A coupon with that code already exists.",
  invalid_value: "Enter a valid discount (percent must be 1–100).",
  invalid_limit: "Limits must be whole numbers above 0 (minimum order can be 0).",
  invalid_expiry: "That expiry date isn't valid.",
  run_migration_016: "Run supabase/migration_016 in the Supabase SQL editor first (needed for multi-product coupons).",
};

export default function CouponsTab({ products }) {
  const [coupons, setCoupons] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [pq, setPq] = useState("");

  async function load() {
    const res = await fetch("/api/admin/coupons");
    const data = await res.json();
    if (data.success) setCoupons(data.coupons);
  }

  useEffect(() => {
    load();
  }, []);

  const toggleProduct = (id) =>
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(id)
        ? f.product_ids.filter((x) => x !== id)
        : [...f.product_ids, id],
    }));
  const titleOf = (id) => products.find((p) => Number(p.id) === Number(id))?.title || `#${id}`;
  const appliesTo = (c) => {
    const ids = c.product_ids?.length ? c.product_ids : c.product_id != null ? [c.product_id] : [];
    return ids.length ? ids.map(titleOf) : null;
  };
  const shownProducts = products.filter((p) =>
    (p.title || "").toLowerCase().includes(pq.trim().toLowerCase())
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create() {
    setMessage({ type: "", text: "" });
    setBusy(true);
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      setMessage({ type: "success", text: `Coupon ${data.coupon.code} created.` });
      setForm(EMPTY);
      load();
    } else {
      setMessage({ type: "error", text: ERRORS[data.error] || data.error });
    }
  }

  async function toggle(c) {
    await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, active: !c.active }),
    });
    load();
  }

  async function remove(c) {
    if (!window.confirm(`Delete coupon ${c.code}? Past orders keep their record of it.`)) return;
    await fetch("/api/admin/coupons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    load();
  }

  const describe = (c) =>
    c.discount_type === "percent"
      ? `${Number(c.discount_value)}% off`
      : `$${Number(c.discount_value).toFixed(2)} off`;

  const state = (c) => {
    if (!c.active) return { label: "Disabled", cls: "bg-border text-muted" };
    if (c.expires_at && new Date(c.expires_at) < new Date())
      return { label: "Expired", cls: "bg-danger-soft text-danger" };
    if (c.max_uses !== null && c.uses >= c.max_uses)
      return { label: "Used up", cls: "bg-warning-soft text-warning" };
    return { label: "Active", cls: "bg-success-soft text-success" };
  };

  return (
    <div className="space-y-10">
      <div>
        <SectionHeading
          title="Create coupon"
          description="Discount codes customers enter in the buy popup. Orders can't drop below $0.10, so a 100% coupon still leaves that minimum."
        />
        <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormInput
                label="Code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. WELCOME10"
                className="font-mono"
                autoComplete="off"
              />
            </div>
            <SecondaryButton onClick={() => setForm((f) => ({ ...f, code: randomCode() }))}>
              Generate
            </SecondaryButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect label="Discount type" value={form.discount_type} onChange={set("discount_type")}>
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed amount ($)</option>
            </FormSelect>
            <FormInput
              label={form.discount_type === "percent" ? "Percent off" : "Dollars off"}
              type="number"
              min="0"
              step="0.01"
              value={form.discount_value}
              onChange={set("discount_value")}
              className="font-mono"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Applies to</span>
              <span className="text-xs text-muted">
                {form.product_ids.length === 0
                  ? "All products"
                  : `${form.product_ids.length} selected`}
              </span>
            </div>
            <input
              value={pq}
              onChange={(e) => setPq(e.target.value)}
              placeholder="Search products…"
              className="mb-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-bg p-1">
              {shownProducts.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-brand-soft"
                >
                  <input
                    type="checkbox"
                    checked={form.product_ids.includes(Number(p.id))}
                    onChange={() => toggleProduct(Number(p.id))}
                  />
                  <span className="min-w-0 break-words">{p.title}</span>
                </label>
              ))}
              {shownProducts.length === 0 && (
                <div className="px-2 py-2 text-sm text-muted">No products found.</div>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => setForm((f) => ({ ...f, product_ids: shownProducts.map((p) => Number(p.id)) }))}
              >
                Select shown
              </button>
              <button
                type="button"
                className="text-muted hover:underline"
                onClick={() => setForm((f) => ({ ...f, product_ids: [] }))}
              >
                Clear (= all products)
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormInput
              label="Total uses"
              type="number"
              min="1"
              value={form.max_uses}
              onChange={set("max_uses")}
              placeholder="Unlimited"
              hint="Across all customers"
            />
            <FormInput
              label="Uses per customer"
              type="number"
              min="1"
              value={form.per_user_limit}
              onChange={set("per_user_limit")}
              placeholder="Unlimited"
            />
            <FormInput
              label="Minimum order ($)"
              type="number"
              min="0"
              step="0.01"
              value={form.min_order}
              onChange={set("min_order")}
              placeholder="None"
            />
          </div>

          <FormInput
            label="Expires"
            type="datetime-local"
            value={form.expires_at}
            onChange={set("expires_at")}
            hint="Optional. Leave empty for no expiry."
          />

          <Alert variant={message.type === "success" ? "success" : "error"}>{message.text}</Alert>
          <PrimaryButton onClick={create} disabled={busy || !form.code || !form.discount_value}>
            {busy ? "Creating…" : "Create coupon"}
          </PrimaryButton>
        </div>
      </div>

      <div>
        <SectionHeading title="All coupons" />
        {coupons === null ? (
          <LoadingState label="Loading coupons…" />
        ) : (
          <DataTable minWidth="min-w-[860px]">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Applies to</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Given</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-muted">
                    No coupons yet.
                  </td>
                </tr>
              )}
              {coupons.map((c) => {
                const st = state(c);
                return (
                  <tr key={c.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3 font-mono font-medium text-ink">{c.code}</td>
                    <td className="px-4 py-3 text-ink">
                      {describe(c)}
                      {c.min_order !== null && (
                        <div className="text-xs text-muted">min ${Number(c.min_order).toFixed(2)}</div>
                      )}
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-ink">
                      {appliesTo(c) ? (
                        <div className="space-y-0.5">
                          {appliesTo(c).map((t, i) => (
                            <div key={i} className="text-xs">• {t}</div>
                          ))}
                        </div>
                      ) : (
                        "All products"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">
                      {c.uses}
                      {c.max_uses !== null ? ` / ${c.max_uses}` : ""}
                      {c.per_user_limit !== null && (
                        <div className="font-sans text-xs text-muted">{c.per_user_limit}/customer</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">${c.discount_given.toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.expires_at ? new Date(c.expires_at).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <SecondaryButton onClick={() => toggle(c)} className="px-3 py-1.5 text-xs">
                          {c.active ? "Disable" : "Enable"}
                        </SecondaryButton>
                        <DangerButton onClick={() => remove(c)} className="px-3 py-1.5 text-xs">
                          Delete
                        </DangerButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
