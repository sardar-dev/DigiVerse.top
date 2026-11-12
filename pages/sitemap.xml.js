import { SITE_URL } from "../lib/siteConfig";
import { getAllPosts } from "../lib/blog";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import { toProductCode } from "../lib/productLink";

const STATIC_PAGES = [
  { path: "", changefreq: "daily", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/terms", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4" },
];

export async function getServerSideProps({ res }) {
  const today = new Date().toISOString().split("T")[0];

  // 1. Static Pages
  const staticXml = STATIC_PAGES.map(
    (p) =>
      `<url><loc>${SITE_URL}${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
  ).join("");

  // 2. Blog Posts
  const blogPosts = getAllPosts();
  const blogXml = blogPosts
    .map(
      (p) =>
        `<url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${p.updated || p.date || today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`
    )
    .join("");

  // 3. Storefront Products (Dynamic Catalog Indexing)
  let productsXml = "";
  try {
    const { data: products } = await fetchStorefrontProducts();
    if (Array.isArray(products) && products.length > 0) {
      productsXml = products
        .map((p) => {
          const code = toProductCode(p.id);
          const lastMod = p.updated_at ? p.updated_at.split("T")[0] : today;
          return `<url><loc>${SITE_URL}/?product=${code}</loc><lastmod>${lastMod}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`;
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

