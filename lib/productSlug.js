import { fromProductCode, toProductCode } from "./productLink.js";

/**
 * Creates an SEO-friendly URL slug from product title and id.
 * Example: "Office 365 Lifetime (Premade)" (id: 25) -> "office-365-lifetime-premade-25"
 */
export function slugifyProduct(product) {
  if (!product) return "";
  const title = String(product.title || "")
    // Remove emojis and common non-latin decorative characters
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // remove punctuation except space and dash
    .trim()
    .replace(/\s+/g, "-") // collapse spaces into dashes
    .replace(/-+/g, "-"); // collapse multiple dashes

  const base = title || "item";
  return `${base}-${product.id}`;
}

/**
 * Resolves product ID from any slug format:
 * - "office-365-lifetime-account-25" -> "25"
 * - "telegram-stars--8" -> "-8"
 * - "25" -> "25"
 * - "x7" -> short code decoded
 */
export function extractProductId(slug) {
  if (!slug) return null;
  const s = String(slug).trim();

  // 1. Matches slugs ending in -<negative_or_positive_integer>
  // e.g. "office-365-25" -> "25", "muse-ai--12" -> "-12"
  const match = s.match(/-(-?\d+)$/);
  if (match) return match[1];

  // 2. Direct numeric ID (e.g. "25" or "-12")
  if (/^-?\d+$/.test(s)) return s;

  // 3. Short code (e.g. "x7", "hk3f")
  const fromCode = fromProductCode(s);
  if (fromCode && fromCode !== s) return fromCode;

  return s;
}

/**
 * Returns full path for a product: "/product/[slug]"
 */
export function getProductUrl(product) {
  if (!product) return "/";
  return `/product/${slugifyProduct(product)}`;
}
