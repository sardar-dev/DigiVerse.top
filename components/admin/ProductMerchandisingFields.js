import { useState } from "react";
import { FormInput, FormTextarea } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import ImagePicker from "./ImagePicker";
import CategorySelect from "./CategorySelect";

// Shared editor for the merchandising fields every product — DigiTrust
// or manual — can now carry: image, category, featured flag, low-
// stock threshold, short description. Used as an inline expander on
// the DigiTrust Products tab and embedded directly in the Manual
// Products form.
export default function ProductMerchandisingFields({ product, onSave, onCancel }) {
  const [title, setTitle] = useState(product.title || "");
  const [slug, setSlug] = useState(product.slug || "");
  const [imageUrl, setImageUrl] = useState(product.image_url || "");
  const [category, setCategory] = useState(product.category || "");
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [isOutOfStock, setIsOutOfStock] = useState(Boolean(product.is_out_of_stock));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product.low_stock_threshold ?? ""
  );
  const [shortDescription, setShortDescription] = useState(product.short_description || "");
  const [description, setDescription] = useState(product.description || "");
  const [warranty, setWarranty] = useState(product.warranty || "");

  function save() {
    onSave({
      ...(title.trim() !== (product.title || "") ? { title: title.trim() } : {}),
      slug: slug.trim(),
      warranty: warranty.trim() || null,
      image_url: imageUrl.trim(),
      category: category.trim(),
      featured,
      is_out_of_stock: isOutOfStock,
      low_stock_threshold: lowStockThreshold === "" ? null : Number(lowStockThreshold),
      short_description: shortDescription.trim(),
      description: description.trim(),
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
      <FormInput
        label="URL Slug (SEO friendly path)"
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        placeholder="e.g. buy-muse-ai-tokens"
        maxLength={150}
        hint={`Direct product link: https://digiverse.top/${slug || "your-product-slug"}`}
      />
      <FormInput
        label="Warranty Policy"
        value={warranty}
        onChange={(e) => setWarranty(e.target.value)}
        placeholder="e.g. 1 Month, 30 Days, FW, NW (leave blank to default to 'Stated in product description')"
        maxLength={100}
        hint="Displayed on product landing page. If left blank, it displays 'Stated in product description'."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormInput
          label="Image/logo URL"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          hint="Paste a link to an already-hosted image. Leave blank for the default letter icon."
        />
        <CategorySelect
          label="Category"
          value={category}
          onChange={setCategory}
          hint="Shown as a filter on the homepage."
        />
      </div>
      <ImagePicker title={title || product.title} onPick={setImageUrl} />
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
      <FormTextarea
        label="Full description (product popup)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        hint={
          product.description
            ? "Editing the supplier's description. Your changes are saved and syncs won't overwrite them."
            : "No supplier description yet — add your own."
        }
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
        <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={isOutOfStock}
            onChange={(e) => setIsOutOfStock(e.target.checked)}
            className="h-4 w-4 accent-danger"
          />
          <span className="font-semibold text-danger">Force Out of Stock</span> (stays on site, orders stopped)
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
