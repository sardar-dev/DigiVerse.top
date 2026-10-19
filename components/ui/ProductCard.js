import { useState } from "react";
import { PrimaryButton } from "./Button";

// Storefront product card. Shows provider-neutral labels only —
// never exposes cost price or internal DigiTrust/manual plumbing to
// the customer.
//
// Always carries a slight permanent 3D tilt + deep shadow (so the
// grid reads as a stack of physical cards rather than flat tiles at
// rest), and softens — lifts slightly, tilt relaxes, shadow spreads —
// on hover. Pure CSS transform/perspective, no JS and no library.
export default function ProductCard({ product, onBuy, onShare, disabled }) {
  const isManual = product.provider === "manual" && !product.auto_delivery;
  const threshold =
    product.low_stock_threshold != null ? Number(product.low_stock_threshold) : 3;
  const lowStock = product.available_stock > 0 && product.available_stock <= threshold;
  const outOfStock = product.available_stock <= 0;
  const letter = (product.title || "?").trim().charAt(0).toUpperCase();
  const blurb = product.short_description || product.description;
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(product.image_url) && !imageFailed;

  return (
    <div
      className="group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/30 hover:shadow-[0_16px_32px_-12px_rgba(23,33,58,0.22)]"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        {showImage ? (
          <img loading="lazy" decoding="async"
            src={product.image_url}
            alt=""
            className="h-12 w-12 rounded-xl border border-border object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-white text-base font-semibold text-brand ring-1 ring-border">
            {letter}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              isManual ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
            }`}
          >
            {isManual ? "Manual delivery" : "Automatic delivery"}
          </span>
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              title="Copy shareable link to this product"
              aria-label="Share this product"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border text-muted hover:border-brand hover:text-brand"
            >
              <span aria-hidden="true">🔗</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-ink">{product.title}</h3>
        {product.featured && (
          <span
            className="flex-shrink-0 text-base"
            role="img"
            aria-label="Featured product"
            title="Featured"
          >
            ⭐
          </span>
        )}
      </div>
      {blurb && <p className="mt-1 line-clamp-2 text-sm text-muted">{blurb}</p>}

      <div className="mb-4 mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        {outOfStock ? (
          <span className="font-medium text-danger">Out of stock</span>
        ) : (
          <span className={lowStock ? "font-medium text-warning" : ""}>
            {lowStock && "🔥 "}
            {product.available_stock} available
          </span>
        )}
        {isManual && (
          <span className="before:mr-2 before:content-['·']">
            {product.delivery || "Delivery within 1–6 hours"}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xl font-bold tracking-tight text-ink">
          ${Number(product.sell_price).toFixed(2)}
        </span>
        <PrimaryButton onClick={onBuy} disabled={disabled || outOfStock} className="px-4 py-2">
          {outOfStock ? "Out of stock" : "Buy now"}
        </PrimaryButton>
      </div>
    </div>
  );
}
