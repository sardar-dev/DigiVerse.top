/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The sitemap lists blog posts by reading /content/blog at request time.
  experimental: {
    outputFileTracingIncludes: { "/sitemap.xml": ["./content/blog/**/*"] },
  },

  // One canonical host: www.digiverse.top -> digiverse.top, so search
  // engines (and Safe Browsing) see a single site, not two copies.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.digiverse.top" }],
        destination: "https://digiverse.top/:path*",
        permanent: true,
      },
    ];
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
