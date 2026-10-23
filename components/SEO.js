import Head from "next/head";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from "../lib/siteConfig";

// One shared component so every page gets consistent, correct SEO
// tags instead of copy-pasted <Head> blocks drifting out of sync.
export default function SEO({
  title,
  description,
  path = "",
  noindex = false,
  image,
  type = "website",
}) {
  const fullTitle = title
    ? `${title} — ${SITE_NAME}`
    : "DigiVerse — Instant Digital Products & Subscriptions";
  const url = `${SITE_URL}${path}`;
  // Share previews need an absolute image URL. Defaults to the static
  // branded card in /public (served by Vercel CDN, no function cost).
  const img = image
    ? /^https?:\/\//.test(image) ? image : `${SITE_URL}${image}`
    : `${SITE_URL}/og-image.png`;
  const desc = description || SITE_DESCRIPTION;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />
      <meta property="og:image:alt" content={fullTitle} />

      {/* Twitter card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
      <meta name="theme-color" content="#3169F5" />

      {/* Google Search Console ownership verification */}
      <meta name="google-site-verification" content="sRurRBK_qxB1q-UqsaETPM22-DJDUgYvwrB04Sngv7g" />

      {/* Branded icons (static files in /public) */}
      <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
  );
}
