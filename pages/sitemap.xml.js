import { SITE_URL } from "../lib/siteConfig";

const PAGES = ["", "/about", "/terms", "/privacy"];

export async function getServerSideProps({ res }) {
  const urls = PAGES.map(
    (p) =>
      `<url><loc>${SITE_URL}${p}</loc><changefreq>daily</changefreq></url>`
  ).join("");

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
