import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import { slugifyProduct, extractProductId } from "../lib/productSlug";

const RESERVED_PATHS = new Set([
  "api",
  "admin",
  "account",
  "auth",
  "login",
  "signup",
  "about",
  "terms",
  "privacy",
  "blog",
  "reset-password",
  "muse-ai-tokens",
  "product",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
]);

// 301 Permanent Redirect: Forwards legacy root-level product URLs (e.g. /buy-muse-ai-tokens)
// to the canonical /product/<slug> route (e.g. /product/buy-muse-ai-tokens).
// Note: Blog posts at /<slug> are handled via beforeFiles rewrites in next.config.js.
export async function getServerSideProps({ params, locale = "en" }) {
  const { slug } = params || {};

  if (!slug || RESERVED_PATHS.has(slug)) {
    return { notFound: true };
  }

  const productId = extractProductId(slug);

  let products = [];
  try {
    const { data } = await fetchStorefrontProducts();
    products = data || [];
  } catch {}

  const product = products.find(
    (p) =>
      p.slug === slug ||
      slugifyProduct(p) === slug ||
      String(p.id) === String(productId)
  );

  if (!product) {
    return { notFound: true };
  }

  const canonicalSlug = slugifyProduct(product);
  const prefix = locale && locale !== "en" ? `/${locale}` : "";

  return {
    redirect: {
      destination: `${prefix}/product/${canonicalSlug}`,
      permanent: true,
    },
  };
}

export default function LegacyRootProductRedirect() {
  return null;
}
