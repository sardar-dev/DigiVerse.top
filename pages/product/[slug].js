import { fetchStorefrontProducts } from "../../lib/storefrontProducts";
import { slugifyProduct, extractProductId } from "../../lib/productSlug";

// 301 Permanent Redirect: Forwards all legacy /product/[slug] and /product/[id]
// links directly to the new clean root slug (e.g. /buy-muse-ai-tokens)
export async function getServerSideProps({ params, locale = "en" }) {
  const { slug } = params || {};
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
      destination: `${prefix}/${canonicalSlug}`,
      permanent: true,
    },
  };
}

export default function LegacyProductRedirect() {
  return null;
}
