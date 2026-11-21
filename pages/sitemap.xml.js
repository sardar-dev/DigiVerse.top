import { SITE_URL } from "../lib/siteConfig";
import { getAllPosts } from "../lib/blog";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import { slugifyProduct } from "../lib/productSlug";

const STATIC_PAGES = [
  { path: "", changefreq: "daily", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/muse-ai-tokens", changefreq: "daily", priority: "0.9" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/terms", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4" },
  { path: "/llms.txt", changefreq: "weekly", priority: "0.5" },
];

export async function getServerSideProps({ res }) {
  const today = new Date().toISOString().split("T")[0];

  // 1. Static Pages (English, Arabic, Russian)
  const staticXml = STATIC_PAGES.map((p) => {
    const en = `<url><loc>${SITE_URL}${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`;
    if (!p.path || p.path === "/llms.txt") return en;
    const ar = `<url><loc>${SITE_URL}/ar${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${(Number(p.priority) * 0.9).toFixed(1)}</priority></url>`;
    const ru = `<url><loc>${SITE_URL}/ru${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${(Number(p.priority) * 0.9).toFixed(1)}</priority></url>`;
    return en + ar + ru;
  }).join("");

  // 2. Blog Posts (Multi-locale)
  const blogPosts = getAllPosts();
  const blogXml = blogPosts
    .map((p) => {
      const lastMod = p.updated || p.date || today;
      const en = `<url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${lastMod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      const ar = `<url><loc>${SITE_URL}/ar/blog/${p.slug}</loc><lastmod>${lastMod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
      const ru = `<url><loc>${SITE_URL}/ru/blog/${p.slug}</loc><lastmod>${lastMod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
      return en + ar + ru;
    })
    .join("");

  // 3. Storefront Products (Dedicated Clean SEO Landing Pages)
  let productsXml = "";
  try {
    const { data: products } = await fetchStorefrontProducts();
    if (Array.isArray(products) && products.length > 0) {
      productsXml = products
        .map((p) => {
          const slug = slugifyProduct(p);
          const lastMod = p.updated_at ? p.updated_at.split("T")[0] : today;
          const en = `<url><loc>${SITE_URL}/product/${slug}</loc><lastmod>${lastMod}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`;
          const ar = `<url><loc>${SITE_URL}/ar/product/${slug}</loc><lastmod>${lastMod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
          const ru = `<url><loc>${SITE_URL}/ru/product/${slug}</loc><lastmod>${lastMod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
          return en + ar + ru;
        })
        .join("");
    }
  } catch (err) {
    console.error("[sitemap.xml] Error fetching storefront products:", err?.message);
  }

  const allUrls = staticXml + productsXml + blogXml;

  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.write(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${allUrls}</urlset>`
  );
  res.end();
  return { props: {} };
}

export default function Sitemap() {
  return null;
}

