import { useState } from "react";
import Link from "next/link";
import { PrimaryButton } from "./Button";
import { useT } from "../../lib/i18n";
import { getProductUrl, getProductInitial } from "../../lib/productSlug";

// Storefront product card. Shows provider-neutral labels only —
// never exposes cost price or internal supplier plumbing to the customer.
//
// Refined with modern clean cloud commerce standards: subtle borders,
// soft depth, crisp typography, clean status badges, and smooth hover elevation.
export default function ProductCard({ product, onBuy, onShare, disabled }) {
  const { t } = useT();
  const isDemo = String(product.id) === "-99" || product.category === "Demo / Testing 🧪";
  const isManual =
    product.delivery_badge === "manual"
      ? true
      : product.delivery_badge === "auto"
      ? false
      : product.provider === "manual" && !product.auto_delivery;
  const threshold =
    product.low_stock_threshold != null ? Number(product.low_stock_threshold) : 3;
  const lowStock = !isDemo && !product.is_out_of_stock && product.available_stock > 0 && product.available_stock <= threshold;
  const outOfStock = !isDemo && (Boolean(product.is_out_of_stock) || product.available_stock <= 0);
  const letter = getProductInitial(product.title);
  const rawBlurb = product.short_description || product.description;
  const cleanBlurb = (rawBlurb || "").replace(/^description:\s*/i, "").trim();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(product.image_url) && !imageFailed;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border border-border/85 bg-surface p-5 shadow-card transition-all duration-200 ${
        outOfStock
          ? "bg-bg/60"
          : "before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-brand before:to-transparent before:opacity-0 before:transition-opacity hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_14px_30px_-8px_rgba(49,105,245,0.2),0_0_0_1px_rgba(49,105,245,0.15)] hover:before:opacity-100"
      }`}
      aria-disabled={outOfStock || undefined}
    >
      {outOfStock && (
        <span className="absolute -top-2.5 start-5 z-10 rounded-full bg-danger px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
          {t("Sold out")}
        </span>
      )}

      <div className={outOfStock ? "flex flex-1 flex-col opacity-60 grayscale" : "flex flex-1 flex-col"}>
        {/* Top Header: Product Avatar + Delivery Tag + Share Action */}
        <div className="mb-3.5 flex items-start justify-between gap-2.5">
          <Link href={getProductUrl(product)} className="block flex-shrink-0" aria-label={product.title}>
            {showImage ? (
              <img
                loading="lazy"
                decoding="async"
                src={product.image_url}
                alt=""
                className="h-12 w-12 flex-shrink-0 rounded-xl border border-border/80 bg-bg p-0.5 object-cover shadow-2xs transition-transform duration-200 group-hover:scale-105"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-white text-base font-bold text-brand shadow-2xs ring-1 ring-border/80">
                {letter}
              </div>
            )}
          </Link>

          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-2xs border ${
                isDemo
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25"
                  : isManual
                  ? "bg-warning-soft text-warning border-warning/20"
                  : "bg-success-soft text-success border-success/20"
              }`}
            >
              {isDemo ? (
                <>
                  <span>⚡</span>
                  <span>{String(product.delivery_badge || t("0-Cost Test Order")).replace(/^[⚡\s]+/, "")}</span>
                </>
              ) : isManual ? (
                <>
                  <svg className="h-3 w-3 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{t("Manual delivery")}</span>
                </>
              ) : (
                <>
                  <svg className="h-3 w-3 text-success" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  <span>{t("Automatic delivery")}</span>
                </>
              )}
            </span>

            {onShare && (
              <button
                type="button"
                onClick={onShare}
                title={t("Copy shareable link to this product")}
                aria-label={t("Share this product")}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border/80 bg-surface text-muted transition-all duration-200 hover:border-brand-light hover:bg-brand-soft hover:text-brand active:scale-90"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Title & Featured Indicator */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-snug text-ink transition-colors duration-200 group-hover:text-brand">
            <Link href={getProductUrl(product)} className="hover:underline">
              {product.title}
            </Link>
          </h3>
          {product.featured && (
            <span
              className="inline-flex items-center gap-1 flex-shrink-0 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"
              title={t("Featured product")}
            >
              <span>★</span>
              <span>{t("Featured")}</span>
            </span>
          )}
        </div>

        {/* Description / Summary */}
        {cleanBlurb && (
          <p className="mt-1.5 line-clamp-2 text-xs sm:text-sm text-muted leading-relaxed">
            {cleanBlurb}
          </p>
        )}

        {/* Stock & Delivery Details */}
        <div className="mb-4 mt-3 flex flex-wrap items-center gap-2.5 text-xs text-muted">
          {isDemo ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span>
                <strong className="font-semibold text-ink">{t("Unlimited")}</strong> {t("in stock")}
              </span>
            </span>
          ) : outOfStock ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              {t("Out of stock")}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 ${lowStock ? "font-semibold text-warning" : "font-medium text-muted"}`}>
              {lowStock ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                  <span>🔥 {t("{n} left in stock", { n: product.available_stock })}</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  <span>
                    <strong className="font-semibold text-ink">{product.available_stock}</strong> {t("available")}
                  </span>
                </>
              )}
            </span>
          )}

          {isManual && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <span className="text-border" aria-hidden="true">•</span>
              <span>{product.delivery || t("Delivery within 1–6 hours")}</span>
            </span>
          )}
        </div>
      </div>

      {/* Footer: Price + Buy CTA Button */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/80 pt-4">
        <div className="flex flex-col" dir="ltr">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">{t("Price")}</span>
          <div className="flex items-baseline gap-1">
            {isDemo || Number(product.sell_price) <= 0 ? (
              <>
                <span className="font-mono text-xl font-extrabold tracking-tight text-brand">
                  $0.00
                </span>
                <span className="text-[10px] font-bold text-success uppercase">FREE DEMO</span>
              </>
            ) : (
              <>
                <span className="font-mono text-xl font-extrabold tracking-tight text-ink transition-colors group-hover:text-brand">
                  ${Number(product.sell_price).toFixed(2)}
                </span>
                <span className="text-[10px] font-semibold text-muted uppercase">USDT</span>
              </>
            )}
          </div>
        </div>

        <Link
          href={getProductUrl(product)}
          className={`min-h-10 px-4 sm:px-5 py-2 font-semibold text-xs sm:text-sm rounded-xl transition-all inline-flex items-center justify-center gap-1.5 shadow-sm ${
            outOfStock
              ? "bg-bg text-muted border border-border hover:bg-surface cursor-pointer"
              : isDemo
              ? "bg-gradient-to-r from-brand to-indigo-600 text-white hover:opacity-95 active:scale-95 shadow-brand/25"
              : "bg-brand text-white hover:bg-brand-hover active:scale-95 shadow-brand/20"
          }`}
          aria-label={outOfStock ? t("{title} is out of stock", { title: product.title }) : t("Buy {title}", { title: product.title })}
        >
          {outOfStock ? (
            <span>{t("Sold out")}</span>
          ) : (
            <>
              <svg className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span>{t("Buy now")}</span>
            </>
          )}
        </Link>
      </div>
    </div>
  );
}
