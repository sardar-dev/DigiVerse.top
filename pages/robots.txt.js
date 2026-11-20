import { SITE_URL } from "../lib/siteConfig";

export async function getServerSideProps({ res }) {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.write(
    `# Search engines and AI crawlers are explicitly allowed (no blocking).
# Private areas stay closed; product pages are server-rendered HTML.
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: anthropic-ai
User-agent: Google-Extended
User-agent: CCBot
User-agent: PerplexityBot
User-agent: Googlebot
User-agent: Bingbot
Allow: /
Disallow: /admin
Disallow: /account

User-agent: *
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
