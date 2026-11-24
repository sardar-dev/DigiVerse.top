const fs = require("fs");
const path = require("path");

// Every published blog post is served at the domain root (/<slug>), with the
// old /blog/<slug> URL permanently redirected. Slugs come from the file names in
// content/blog. A slug that matches a real page file is skipped (no clash).
function blogSlugs() {
  try {
    return fs
      .readdirSync(path.join(__dirname, "content", "blog"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .filter((s) => !fs.existsSync(path.join(__dirname, "pages", `${s}.js`)));
  } catch {
    return [];
  }
}
const BLOG_SLUGS = blogSlugs();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Customer-facing languages. English stays the default (served at "/"),
  // Arabic at /ar and Russian at /ru. Translations live in /locales.
  i18n: {
    locales: ["en", "ar", "ru"],
    defaultLocale: "en",
    localeDetection: false, // never auto-switch; visitors pick from the dropdown
  },

  // The sitemap lists blog posts by reading /content/blog at request time.
  experimental: {
    outputFileTracingIncludes: { "/sitemap.xml": ["./content/blog/**/*"] },
  },

  // One canonical host: www.digiverse.top -> digiverse.top, so search
  // engines (and Safe Browsing) see a single site, not two copies.
  async redirects() {
    return [
      // Posts live at the domain root; send the old /blog/<slug> URL there.
      ...BLOG_SLUGS.map((s) => ({ source: `/blog/${s}`, destination: `/${s}`, permanent: true })),
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.digiverse.top" }],
        destination: "https://digiverse.top/:path*",
        permanent: true,
      },
    ];
  },

  // Root-level post URLs are rendered by the blog template (pages/blog/[slug].js).
  async rewrites() {
    return {
      beforeFiles: BLOG_SLUGS.map((s) => ({ source: `/${s}`, destination: `/blog/${s}` })),
    };
  },

  // Standard hardening headers. frame-ancestors/X-Frame-Options stops
  // other sites from embedding ours inside a look-alike page.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
