import { SITE_URL } from "../lib/siteConfig";

export async function getServerSideProps({ res }) {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.write(
    `User-agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /api

# LLM & AI Knowledge Files (AEO & GEO Optimization)
Allow: /llms.txt
Allow: /llms-full.txt

Sitemap: ${SITE_URL}/sitemap.xml
`
  );
  res.end();
  return { props: {} };
}

export default function Robots() {
  return null;
}
