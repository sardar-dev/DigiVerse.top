import { useState } from "react";
import { FormInput, FormTextarea } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../ui/Button";

// Shared editor for the merchandising fields every product — DigiTrust
// or manual — can now carry: image, category, featured flag, low-
// stock threshold, short description. Used as an inline expander on
// the DigiTrust Products tab and embedded directly in the Manual
// Products form.
export default function ProductMerchandisingFields({ product, onSave, onCancel }) {
  const [title, setTitle] = useState(product.title || "");
  const [imageUrl, setImageUrl] = useState(product.image_url || "");
  const [category, setCategory] = useState(product.category || "");
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product.low_stock_threshold ?? ""
  );
  const [shortDescription, setShortDescription] = useState(product.short_description || "");

  function save() {
    onSave({
      ...(title.trim() !== (product.title || "") ? { title: title.trim() } : {}),
      image_url: imageUrl.trim(),
      category: category.trim(),
      featured,
      low_stock_threshold: lowStockThreshold === "" ? null : Number(lowStockThreshold),
      short_description: shortDescription.trim(),
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <FormInput
        label="Product title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        hint={
          product.title_locked
            ? "Custom title — syncs won't overwrite it. Clear the box and save to go back to the supplier's title."
            : "Edit to rename this product. Your title is kept even when the supplier syncs."
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormInput
          label="Image/logo URL"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          hint="Paste a link to an already-hosted image. Leave blank for the default letter icon."
        />
        <FormInput
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Streaming"
          hint="Used to build filter tabs on the homepage."
        />
      </div>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Preview"
          className="h-12 w-12 rounded-lg border border-border object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <FormTextarea
        label="Short description (storefront card)"
        value={shortDescription}
        onChange={(e) => setShortDescription(e.target.value)}
        rows={2}
        hint="Shown on the product grid card. Falls back to the full description if left blank."
      />
      <div className="flex flex-wrap items-end gap-4">
        <FormInput
          label="Low-stock threshold"
          type="number"
          min="0"
          step="1"
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
          placeholder="3 (default)"
          className="w-40"
          hint="Shows a low-stock warning at or below this count."
        />
        <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Featured (shown first on storefront)
        </label>
      </div>
      <div className="flex gap-3">
        <PrimaryButton onClick={save} className="px-4 py-2 text-sm">
          Save details
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} className="px-4 py-2 text-sm">
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}
