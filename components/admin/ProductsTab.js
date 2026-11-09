import { Fragment, useState } from "react";
import { FormInput } from "../ui/FormInput";
import { SecondaryButton, LinkButton } from "../ui/Button";
import DataTable from "./DataTable";
import BulkActionBar from "./BulkActionBar";
import ProductMerchandisingFields from "./ProductMerchandisingFields";

const SUPPLIER_COLORS = {
  digitrust: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  xpro:      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};
const DEFAULT_COLOR = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";

function supplierLabel(id) {
  if (!id) return "";
  const map = { digitrust: "DigiTrust", xpro: "XPro", emstore: "EM Store", shotix: "Shotix", tunvn: "TunVN" };
  if (map[id]) return map[id];
  // c_shotix → "Shotix" (Canboso is the same store — built-in shotix is used instead)
  if (id.startsWith("c_")) return id.slice(2).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return id;
}
function supplierColor(id) {
  return SUPPLIER_COLORS[id] || DEFAULT_COLOR;
}

export default function ProductsTab({
  productSearch,
  setProductSearch,
  sortAvailableFirst,
  setSortAvailableFirst,
  visibleProducts,
  productView = "all",
  setProductView,
  supplierFilter = "all",
  setSupplierFilter,
  supplierList = [],
  updateProduct,
  bulkUpdateProducts,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runBulk(patch) {
    await bulkUpdateProducts(Array.from(selected), patch);
    clearSelection();
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        {/* Row 1: search + sort */}
        <div className="flex flex-wrap gap-3 justify-between">
          <FormInput
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Search products…"
            className="min-w-[200px] flex-1 max-w-sm"
            aria-label="Search products"
          />
          <SecondaryButton onClick={() => setSortAvailableFirst((s) => !s)} className="whitespace-nowrap text-sm">
            {sortAvailableFirst ? "Sorted: in-stock first ✓" : "Sort: in-stock first"}
          </SecondaryButton>
        </div>

        {/* Row 2: visibility + supplier filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Visibility */}
          <div className="flex gap-1" role="group" aria-label="Show products">
            {[["all","All"],["live","Live"],["hidden","Hidden"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setProductView?.(k)} aria-pressed={productView === k}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-all ${productView === k ? "bg-brand text-white shadow-[0_4px_12px_-4px_rgba(49,105,245,0.7)]" : "bg-brand-soft text-brand hover:bg-brand/10"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Divider */}
          {supplierList.length > 0 && <span className="text-border">|</span>}

          {/* Supplier filter — auto-built from live data */}
          {supplierList.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by supplier">
              <button type="button" onClick={() => setSupplierFilter?.("all")} aria-pressed={supplierFilter === "all"}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-all ${supplierFilter === "all" ? "bg-ink text-bg" : "bg-surface border border-border text-muted hover:text-ink"}`}>
                All suppliers
              </button>
              {supplierList.map((id) => (
                <button key={id} type="button" onClick={() => setSupplierFilter?.(id)} aria-pressed={supplierFilter === id}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-all ${
                    supplierFilter === id
                      ? supplierColor(id) + " ring-2 ring-offset-1 ring-current"
                      : "bg-surface border border-border text-muted hover:text-ink"
                  }`}>
                  {supplierLabel(id)}
                  <span className="ml-1.5 opacity-60 text-xs">
                    {visibleProducts.filter(p => (p.active_supplier || p.provider) === id || p.sources?.some(s => s.supplier === id)).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        onShow={() => runBulk({ selected: true })}
        onHide={() => runBulk({ selected: false })}
        onAdjustPercent={(pct) => runBulk({ sell_price_delta_percent: pct })}
        onClear={clearSelection}
      />

      <DataTable minWidth="min-w-[720px]">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="py-3 px-4">
              <input
                type="checkbox"
                aria-label="Select all visible products"
                checked={visibleProducts.length > 0 && selected.size === visibleProducts.length}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(visibleProducts.map((p) => p.id)) : new Set())
                }
                className="h-4 w-4 accent-brand"
              />
            </th>
            <th className="py-3 px-4">Product</th>
            <th className="py-3 px-4">Real stock</th>
            <th className="py-3 px-4">Shown as</th>
            <th className="py-3 px-4">Supplier cost</th>
            <th className="py-3 px-4">Your price</th>
            <th className="py-3 px-4">Show on site</th>
            <th className="py-3 px-4">Details</th>
          </tr>
        </thead>
        <tbody>
          {visibleProducts.map((p) => (
            <Fragment key={p.id}>
              <tr
                className={`border-b border-border last:border-0 ${
                  p.available_stock === 0 ? "opacity-50" : ""
                }`}
              >
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={`Select ${p.title}`}
                    className="h-4 w-4 accent-brand"
                  />
                </td>
                <td className="py-3 px-4 text-ink">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{p.title}</span>
                    {/* Supplier badge — shown when not filtered to one supplier */}
                    {supplierFilter === "all" && (p.active_supplier || p.provider) && (p.provider !== "manual") && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${supplierColor(p.active_supplier || p.provider)}`}>
                        {supplierLabel(p.active_supplier || p.provider)}
                      </span>
                    )}
                    {p.featured && <span title="Featured">⭐</span>}
                    {p.sources?.length > 1 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">🔗 {p.sources.length}</span>}
                    {p.title_locked && <span className="text-xs text-muted" title="Custom title (kept on sync)">✎</span>}
                  </div>
                  {p.supplier_status === "price_too_high" && (
                    <div className="mt-0.5 text-xs text-danger">Hidden: every in-stock supplier costs more than your price</div>
                  )}
                </td>
                <td className="py-3 px-4 font-mono text-muted">
                  {p.sources?.length > 1 ? (
                    <div className="space-y-0.5">
                      {p.sources.map((s) => (
                        <div key={s.supplier} className="whitespace-nowrap">
                          <span className="font-sans text-xs">{supplierLabel(s.supplier)}</span> {s.stock}
                        </div>
                      ))}
                    </div>
                  ) : (
                    p.real_stock
                  )}
                </td>
                <td className="py-3 px-4 font-mono text-ink">{p.available_stock}</td>
                <td className="py-3 px-4 font-mono text-muted">
                  {p.sources?.length > 1 ? (
                    <div className="space-y-0.5">
                      {p.sources.map((s) => {
                        const inUse = p.active_supplier === s.supplier;
                        return (
                          <div key={s.supplier} className={`whitespace-nowrap ${inUse ? "font-semibold text-ink" : ""}`}>
                            <span className="font-sans text-xs">{supplierLabel(s.supplier)}</span> $
                            {Number(s.cost).toFixed(2)}
                            {inUse && <span className="ml-1 font-sans text-xs text-brand">in use</span>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      ${Number(p.cost_price).toFixed(2)}
                      {p.active_supplier && (
                        <div className="font-sans text-xs">{supplierLabel(p.active_supplier)}</div>
                      )}
                    </>
                  )}
                </td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={p.sell_price}
                    key={`${p.id}-${p.sell_price}`}
                    onBlur={(e) => {
                      // only a real change counts as a hand-set price
                      if (Number(e.target.value) !== Number(p.sell_price)) updateProduct(p.id, { sell_price: Number(e.target.value) });
                    }}
                    className="w-24 rounded-md border border-border px-2 py-1 font-mono text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  {p.provider !== "manual" && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                      <label className="flex cursor-pointer items-center gap-1" title="Follow the supplier price using your profit rule (Pricing tab). Off unless you tick it.">
                        <input
                          type="checkbox"
                          checked={p.auto_price === true}
                          onChange={(e) => updateProduct(p.id, { auto_price: e.target.checked })}
                          className="h-3 w-3 accent-brand"
                        />
                        Auto
                      </label>
                      <input
                        key={`m-${p.id}-${p.auto_margin ?? ""}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={p.auto_margin ?? ""}
                        placeholder="margin $"
                        aria-label={`Margin in dollars for ${p.title}`}
                        title="Your profit per item in $. Empty = use the Pricing tab rule."
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const next = v === "" ? null : Number(v);
                          if (next !== (p.auto_margin ?? null)) updateProduct(p.id, { auto_margin: next });
                        }}
                        className="w-16 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-ink focus:border-brand focus:outline-none"
                      />
                    </div>
                  )}
                </td>
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={p.selected}
                    onChange={(e) => updateProduct(p.id, { selected: e.target.checked })}
                    className="h-4 w-4 accent-brand"
                  />
                </td>
                <td className="py-3 px-4">
                  <LinkButton onClick={() => setEditingId(editingId === p.id ? null : p.id)} className="text-xs">
                    {editingId === p.id ? "Close" : "Edit"}
                  </LinkButton>
                </td>
              </tr>
              {editingId === p.id && (
                <tr className="border-b border-border last:border-0 bg-bg">
                  <td colSpan={8} className="p-4">
                    <ProductMerchandisingFields
                      product={p}
                      onSave={(patch) => {
                        updateProduct(p.id, patch);
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
