import { Fragment, useState } from "react";
import { FormInput } from "../ui/FormInput";
import { SecondaryButton, LinkButton } from "../ui/Button";
import DataTable from "./DataTable";
import BulkActionBar from "./BulkActionBar";
import ProductMerchandisingFields from "./ProductMerchandisingFields";

const SUPPLIER_LABEL = { digitrust: "DigiTrust", xpro: "XPro" };

export default function ProductsTab({
  productSearch,
  setProductSearch,
  sortAvailableFirst,
  setSortAvailableFirst,
  visibleProducts,
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
      <div className="mb-4 flex flex-wrap gap-3 justify-between">
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
                  {p.title}
                  {p.featured && <span className="ml-1.5" title="Featured">⭐</span>}
                  {p.sources?.length > 1 && <span className="ml-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">🔗 {p.sources.length} suppliers</span>}
                  {p.title_locked && <span className="ml-1.5 text-xs text-muted" title="Custom title (kept on sync)">✎</span>}
                  {p.supplier_status === "price_too_high" && (
                    <div className="mt-0.5 text-xs text-danger">Hidden: every in-stock supplier costs more than your price</div>
                  )}
                </td>
                <td className="py-3 px-4 font-mono text-muted">
                  {p.sources?.length > 1 ? (
                    <div className="space-y-0.5">
                      {p.sources.map((s) => (
                        <div key={s.supplier} className="whitespace-nowrap">
                          <span className="font-sans text-xs">{SUPPLIER_LABEL[s.supplier] || s.supplier}</span> {s.stock}
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
                            <span className="font-sans text-xs">{SUPPLIER_LABEL[s.supplier] || s.supplier}</span> $
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
                        <div className="font-sans text-xs">{SUPPLIER_LABEL[p.active_supplier] || p.active_supplier}</div>
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
                    <label className="mt-1 flex cursor-pointer items-center gap-1 text-[11px] text-muted" title="Follow the supplier price using your profit rule (Pricing tab)">
                      <input
                        type="checkbox"
                        checked={p.auto_price !== false}
                        onChange={(e) => updateProduct(p.id, { auto_price: e.target.checked })}
                        className="h-3 w-3 accent-brand"
                      />
                      Auto
                    </label>
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
