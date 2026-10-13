import { useState } from "react";
import { FormInput, FormTextarea, FormSelect } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton, LinkButton } from "../ui/Button";
import SectionHeading from "../ui/SectionHeading";
import DataTable from "./DataTable";
import BulkActionBar from "./BulkActionBar";
import StockBoxesManager from "./StockBoxesManager";

export default function ManualProductsTab({
  manualForm,
  setManualForm,
  saveManualProduct,
  manualMessage,
  manualProducts,
  editManualProduct,
  archiveManualProduct,
  resetManualForm,
  bulkUpdateManualProducts,
  reloadManualProducts,
}) {
  const [selected, setSelected] = useState(() => new Set());

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
    await bulkUpdateManualProducts(Array.from(selected), patch);
    clearSelection();
  }

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <SectionHeading title={manualForm.id !== null ? "Edit product" : "Add a manual product"} />
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card">
          <FormInput
            label="Title"
            value={manualForm.title}
            onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
          />
          <FormTextarea
            label="Description (full, shown in checkout)"
            value={manualForm.description}
            onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
            rows={2}
          />
          <FormTextarea
            label="Short description (storefront card, optional)"
            value={manualForm.short_description}
            onChange={(e) => setManualForm({ ...manualForm, short_description: e.target.value })}
            rows={2}
            hint="Shown on the product grid card. Falls back to the description above if left blank."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormInput
              label="Sell price"
              value={manualForm.sell_price}
              onChange={(e) => setManualForm({ ...manualForm, sell_price: e.target.value })}
              type="number"
              step="0.01"
              className="font-mono"
            />
            <FormInput
              label="Your cost (admin-only)"
              value={manualForm.cost_price}
              onChange={(e) => setManualForm({ ...manualForm, cost_price: e.target.value })}
              type="number"
              step="0.01"
              className="font-mono"
            />
            <FormInput
              label="Stock"
              value={manualForm.auto_delivery ? "" : manualForm.available_stock}
              onChange={(e) => setManualForm({ ...manualForm, available_stock: e.target.value })}
              type="number"
              step="1"
              className="font-mono"
              disabled={manualForm.auto_delivery}
              placeholder={manualForm.auto_delivery ? "Counted from boxes" : undefined}
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-border bg-bg p-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={Boolean(manualForm.auto_delivery)}
              onChange={(e) => setManualForm({ ...manualForm, auto_delivery: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              <strong>Auto delivery</strong> — send stored text to the customer instantly after
              payment
              <span className="block text-xs text-muted">
                You add "boxes" of content (e.g. account details). Each buyer gets their own unique
                box, and stock is the number of unsold boxes.
              </span>
            </span>
          </label>

          {manualForm.auto_delivery && manualForm.id !== null && manualForm._hadAuto && (
            <StockBoxesManager productId={manualForm.id} onChanged={reloadManualProducts} />
          )}
          {manualForm.auto_delivery && manualForm.id === null && (
            <p className="text-xs text-muted">
              Create the product first — you'll then be able to add its delivery boxes right here.
            </p>
          )}
          {manualForm.auto_delivery && manualForm.id !== null && !manualForm._hadAuto && (
            <p className="text-xs text-warning">
              Save changes to switch auto delivery on, then add boxes here.
            </p>
          )}
          <FormInput
            label="Estimated delivery"
            value={manualForm.delivery}
            onChange={(e) => setManualForm({ ...manualForm, delivery: e.target.value })}
            placeholder='e.g. "Within 1-6 hours"'
          />
          <FormSelect
            label="Activation info needed from customer"
            value={manualForm.activation_field}
            onChange={(e) => setManualForm({ ...manualForm, activation_field: e.target.value })}
            hint="Shown to the customer as the box's label/placeholder at checkout, so they know exactly what to provide for activation."
          >
            <option value="">None</option>
            <option value="email">Email</option>
            <option value="username">Username</option>
          </FormSelect>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput
              label="Image/logo URL (optional)"
              value={manualForm.image_url}
              onChange={(e) => setManualForm({ ...manualForm, image_url: e.target.value })}
              placeholder="https://…"
              hint="Paste a link to an already-hosted image. Leave blank for the default letter icon."
            />
            <FormInput
              label="Category (optional)"
              value={manualForm.category}
              onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
              placeholder="e.g. Streaming"
              hint="Used to build filter tabs on the homepage."
            />
          </div>
          {manualForm.image_url && (
            <img
              src={manualForm.image_url}
              alt="Preview"
              className="h-12 w-12 rounded-lg border border-border object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          <div className="flex flex-wrap items-end gap-4">
            <FormInput
              label="Low-stock threshold (optional)"
              type="number"
              min="0"
              step="1"
              value={manualForm.low_stock_threshold}
              onChange={(e) => setManualForm({ ...manualForm, low_stock_threshold: e.target.value })}
              placeholder="3 (default)"
              className="w-44"
              hint="Shows a low-stock warning at or below this count."
            />
            <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={manualForm.featured}
                onChange={(e) => setManualForm({ ...manualForm, featured: e.target.checked })}
                className="h-4 w-4 accent-brand"
              />
              Featured (shown first on storefront)
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={manualForm.selected}
              onChange={(e) => setManualForm({ ...manualForm, selected: e.target.checked })}
              className="h-4 w-4 accent-brand"
            />
            Active (shown on storefront)
          </label>
          <div className="flex gap-3">
            <PrimaryButton onClick={saveManualProduct}>
              {manualForm.id !== null ? "Save changes" : "Create product"}
            </PrimaryButton>
            {manualForm.id !== null && (
              <SecondaryButton onClick={resetManualForm}>Cancel edit</SecondaryButton>
            )}
          </div>
          {manualMessage && <p className="text-sm text-muted">{manualMessage}</p>}
        </div>
      </div>

      <div>
        <SectionHeading title="Your manual products" />
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
                  aria-label="Select all manual products"
                  checked={manualProducts.length > 0 && selected.size === manualProducts.length}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(manualProducts.map((p) => p.id)) : new Set())
                  }
                  className="h-4 w-4 accent-brand"
                />
              </th>
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Stock</th>
              <th className="py-3 px-4">Sell price</th>
              <th className="py-3 px-4">Cost</th>
              <th className="py-3 px-4">Activation</th>
              <th className="py-3 px-4">Active</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {manualProducts.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
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
                </td>
                <td className="py-3 px-4 font-mono text-muted">
                  {p.available_stock}
                  {p.auto_delivery && (
                    <span className="ml-1.5 rounded-full bg-success-soft px-2 py-0.5 font-sans text-[10px] font-medium text-success">
                      auto
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 font-mono text-ink">${Number(p.sell_price).toFixed(2)}</td>
                <td className="py-3 px-4 font-mono text-muted">${Number(p.cost_price).toFixed(2)}</td>
                <td className="py-3 px-4 text-muted">{p.activation_field || "—"}</td>
                <td className="py-3 px-4 text-ink">{p.selected ? "Yes" : "No"}</td>
                <td className="py-3 px-4 space-x-3 whitespace-nowrap">
                  <LinkButton onClick={() => editManualProduct(p)}>Edit</LinkButton>
                  {p.selected && (
                    <LinkButton onClick={() => archiveManualProduct(p.id)} className="text-danger">
                      Archive
                    </LinkButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
