import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton, LinkButton } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/States";
import DataTable from "./DataTable";

const LABEL = { digitrust: "DigiTrust", xpro: "XPro" };
const money = (n) => `$${Number(n).toFixed(2)}`;

const STATUS = {
  ok: { text: "Live", cls: "bg-success-soft text-success" },
  out_of_stock: { text: "Out of stock — hidden", cls: "bg-border text-muted" },
  price_too_high: { text: "Price too high — hidden", cls: "bg-danger-soft text-danger" },
};

// Loads only when opened / refreshed — no polling.
export default function SuppliersTab({ onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState({}); // stub id -> chosen target id

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/suppliers");
      const json = await res.json();
      if (!json.success) throw new Error(json.hint || json.error || "failed");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(body, okMsg) {
    setMsg("");
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) {
      setMsg(`Failed: ${json.error}`);
      return;
    }
    setMsg(okMsg);
    await load();
    onChanged?.();
  }

  async function runCheck() {
    setChecking(true);
    const res = await fetch("/api/admin/suppliers?check=1");
    const json = await res.json();
    setCheck(json.suppliers || []);
    setChecking(false);
  }

  if (loading && !data) return <LoadingState label="Loading suppliers…" />;
  if (error && !data) return <ErrorState title="Couldn't load suppliers" message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Suppliers"
        description="Each product can be sourced from several stores. The cheapest in-stock source that costs no more than your sell price is used automatically; anything pricier stays hidden until you approve it."
        action={
          <div className="flex gap-2">
            <SecondaryButton onClick={runCheck} disabled={checking}>
              {checking ? "Checking…" : "Test connections"}
            </SecondaryButton>
            <SecondaryButton onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </SecondaryButton>
          </div>
        }
      />

      {msg && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink">{msg}</p>}

      {check && (
        <div className="grid gap-3 sm:grid-cols-2">
          {check.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{s.label}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    !s.configured ? "bg-border text-muted" : s.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  }`}
                >
                  {!s.configured ? "Not configured" : s.ok ? "Connected" : "Failed"}
                </span>
              </div>
              {s.configured && s.ok && (
                <p className="mt-2 text-sm text-muted">
                  Wallet balance: <span className="font-mono text-ink">{s.balance === null ? "unknown" : money(s.balance)}</span>
                </p>
              )}
              {s.error && <p className="mt-2 break-all text-xs text-danger">{s.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Needs attention */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Needs your decision (price too high)</h3>
        {data.needsPrice.length + data.multi.filter((m) => m.product.supplier_status === "price_too_high").length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            Nothing waiting. Every in-stock source is within your sell price.
          </p>
        ) : (
          <div className="space-y-3">
            {[...data.multi.filter((m) => m.product.supplier_status === "price_too_high"), ...data.needsPrice].map((m) => (
              <ProductSources key={m.product.id} entry={m} act={act} />
            ))}
          </div>
        )}
      </section>

      {/* Unlinked supplier-only products */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">New supplier products (not linked yet)</h3>
        <p className="mb-2 text-xs text-muted">
          These exist only at a secondary supplier. Link one to the matching store product to give it a second source, or leave it
          and sell it on its own from the Products tab. Check the match carefully before linking — customers get whatever the
          supplier delivers.
        </p>
        {data.unlinked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No unlinked products.
          </p>
        ) : (
          <DataTable minWidth="min-w-[820px]">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Supplier product</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Link to</th>
              </tr>
            </thead>
            <tbody>
              {data.unlinked.map(({ product, source, suggestions }) => (
                <tr key={product.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3 text-ink">
                    {product.title}
                    <div className="text-xs text-muted">{LABEL[product.provider] || product.provider}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{source ? money(source.cost) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-muted">{source ? source.stock : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      {suggestions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-brand-soft px-3 py-1.5">
                          <span className="text-xs text-ink">
                            {s.title} <span className="text-muted">({Math.round(s.score * 100)}% match)</span>
                          </span>
                          <LinkButton
                            className="text-xs"
                            onClick={() =>
                              window.confirm(`Link "${product.title}" to "${s.title}"?`) &&
                              act(
                                { action: "link", stub_product_id: product.id, target_product_id: s.id },
                                "Linked. The cheapest eligible source is now used."
                              )
                            }
                          >
                            Link
                          </LinkButton>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <select
                          value={pick[product.id] || ""}
                          onChange={(e) => setPick((p) => ({ ...p, [product.id]: e.target.value }))}
                          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
                          aria-label="Choose a product to link to"
                        >
                          <option value="">Pick another product…</option>
                          {data.linkTargets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <SecondaryButton
                          className="px-3 py-1.5 text-xs"
                          disabled={!pick[product.id]}
                          onClick={() =>
                            act(
                              { action: "link", stub_product_id: product.id, target_product_id: Number(pick[product.id]) },
                              "Linked. The cheapest eligible source is now used."
                            )
                          }
                        >
                          Link
                        </SecondaryButton>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      {/* Multi-source products */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Products with several sources</h3>
        {data.multi.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            None linked yet.
          </p>
        ) : (
          <div className="space-y-3">
            {data.multi.map((m) => (
              <ProductSources key={m.product.id} entry={m} act={act} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProductSources({ entry, act }) {
  const { product, sources } = entry;
  const st = STATUS[product.supplier_status] || STATUS.ok;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-ink">{product.title}</div>
          <div className="text-xs text-muted">
            Your price <span className="font-mono text-ink">{money(product.sell_price)}</span>
            {!product.selected && " · hidden by you"}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 pr-3">Supplier</th>
              <th className="py-1.5 pr-3">Cost</th>
              <th className="py-1.5 pr-3">Stock</th>
              <th className="py-1.5 pr-3">Margin</th>
              <th className="py-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const margin = Number(product.sell_price) - Number(s.cost);
              const active = product.active_supplier === s.supplier;
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-3 text-ink">
                    {LABEL[s.supplier] || s.supplier}
                    {active && product.supplier_status === "ok" && (
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">in use</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-muted">{money(s.cost)}</td>
                  <td className="py-2 pr-3 font-mono text-muted">
                    {s.available_stock}
                    <span className="text-xs"> / {s.stock}</span>
                  </td>
                  <td className={`py-2 pr-3 font-mono ${margin < 0 ? "text-danger" : "text-success"}`}>
                    {margin >= 0 ? "+" : "−"}
                    {money(Math.abs(margin))}
                  </td>
                  <td className="space-x-3 whitespace-nowrap py-2">
                    {margin < 0 && (
                      <LinkButton
                        onClick={() =>
                          act(
                            { action: "approve", source_id: s.id, approved: !s.approved },
                            s.approved ? "Approval removed." : "Approved — this source can now be shown even though it costs more than your price."
                          )
                        }
                        className={s.approved ? "text-danger" : ""}
                      >
                        {s.approved ? "Remove approval" : "Approve anyway"}
                      </LinkButton>
                    )}
                    {s.supplier !== "digitrust" && sources.length > 1 && (
                      <LinkButton
                        onClick={() =>
                          window.confirm("Unlink this source? It will come back as a separate product on the next sync.") &&
                          act({ action: "unlink", source_id: s.id }, "Unlinked.")
                        }
                        className="text-muted"
                      >
                        Unlink
                      </LinkButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
