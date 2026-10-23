import { SITE_URL } from "../lib/siteConfig";
import { getAllPosts } from "../lib/blog";

const PAGES = ["", "/about", "/blog", "/terms", "/privacy"];

export async function getServerSideProps({ res }) {
  const posts = getAllPosts()
    .map(
      (p) =>
        `<url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${p.updated || p.date}</lastmod><changefreq>monthly</changefreq></url>`
    )
    .join("");
  const urls =
    PAGES.map((p) => `<url><loc>${SITE_URL}${p}</loc><changefreq>daily</changefreq></url>`).join("") + posts;

  res.setHeader("Content-Type", "text/xml");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.write(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  );
  res.end();
  return { props: {} };
}

export default function Sitemap() {
  return null;
}
