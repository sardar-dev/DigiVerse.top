import { fromProductCode, toProductCode } from "./productLink.js";

/**
 * Creates an SEO-friendly URL slug from product.
 * Prefers product.slug if present, else formats the title without trailing IDs.
 * Example: "Notion Education Plus 1-Year Account" -> "notion-education-plus-1-year-account"
 *          "Muse AI Tokens (Invite Code)" -> "buy-muse-ai-tokens"
 */
export function slugifyProduct(product) {
  if (!product) return "";
  if (product.slug && typeof product.slug === "string" && product.slug.trim()) {
    return product.slug.trim().toLowerCase();
  }
  if (String(product.id) === "-12") {
    return "buy-muse-ai-tokens";
  }

  const title = String(product.title || "")
    // Map special characters like 𝕏 to x
    .replace(/𝕏/gi, "x")
    // Remove emojis and common decorative unicode symbols
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // remove punctuation except space and dash
    .trim()
    .replace(/\s+/g, "-") // collapse spaces into dashes
    .replace(/-+/g, "-"); // collapse multiple dashes

  return title || "item";
}

/**
 * Resolves product identifier from any slug format:
 * - "notion-education-plus-1-year-account-54" -> "54" (legacy slug redirect)
 * - "buy-muse-ai-tokens" -> "buy-muse-ai-tokens"
 * - "25" -> "25"
 * - "x7" -> short code decoded
 */
export function extractProductId(slug) {
  if (!slug) return null;
  const s = String(slug).trim().toLowerCase();

  // 1. Matches legacy slugs ending in -<negative_or_positive_integer>
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
 * Returns clean root path for a product: "/[slug]"
 * e.g. "/buy-muse-ai-tokens"
 */
export function getProductUrl(product) {
  if (!product) return "/";
  return `/${slugifyProduct(product)}`;
}
