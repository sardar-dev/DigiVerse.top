import Head from "next/head";
import { useRouter } from "next/router";
import { SITE_NAME, SITE_NAME_PLAIN, SITE_URL, SITE_DESCRIPTION } from "../lib/siteConfig";

const BRAND_NAME = SITE_NAME_PLAIN || "DigiVerse";

// One shared component so every page gets consistent, correct SEO
// tags optimized for WhatsApp, Telegram, Facebook, Twitter/X, Discord & Google.
export default function SEO({
  title,
  description,
  path = "",
  noindex = false,
  image,
  type = "website",
  cardType = "summary", // compact summary card so no massive banner appears!
  imageWidth,
  imageHeight,
}) {
  const { locale = "en" } = useRouter();

  // Clean, high-CTR title without trailing raw emoji that break chat crawler decoders
  const fullTitle = title
    ? `${title} | ${BRAND_NAME}`
    : `${BRAND_NAME} — Instant Digital Products & Subscriptions`;

  const prefix = (l) => (l === "en" ? "" : `/${l}`);
  const url = `${SITE_URL}${prefix(locale)}${path}`;

  // Default to square branded preview image (600x600, ~29KB)
  // Perfectly optimized for WhatsApp (<300KB requirement), Telegram, Facebook, Twitter
  const isCustomImage = Boolean(image);
  const defaultImage = `${SITE_URL}/og-preview.jpg`;
  const img = isCustomImage
    ? (/^https?:\/\//.test(image) ? image : `${SITE_URL}${image}`)
    : defaultImage;

  const desc = description || SITE_DESCRIPTION;

  // Image metadata for WhatsApp and Facebook scraper
  const isJpg = isCustomImage ? (/\.jpe?g($|\?)/i.test(img)) : true;
  const mimeType = isJpg ? "image/jpeg" : "image/png";
  const imgW = imageWidth || (isCustomImage ? 512 : 600);
  const imgH = imageHeight || (isCustomImage ? 512 : 600);

  return (
    <Head>
      {/* Primary HTML & Search Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      {/* Multilingual alternates */}
      {["en", "ar", "ru"].map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={`${SITE_URL}${prefix(l)}${path}`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}${path}`} />

      {/* Search Engine Robots Directive */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Open Graph (Facebook, WhatsApp, LinkedIn, Discord, Telegram, Slack) */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={BRAND_NAME} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:locale" content={{ en: "en_US", ar: "ar_AR", ru: "ru_RU" }[locale] || "en_US"} />
      <meta property="og:image" content={img} />
      <meta property="og:image:secure_url" content={img} />
      <meta property="og:image:type" content={mimeType} />
      <meta property="og:image:width" content={String(imgW)} />
      <meta property="og:image:height" content={String(imgH)} />
      <meta property="og:image:alt" content={fullTitle} />

      {/* Twitter / X & Telegram Card (summary = clean compact card, NOT massive banner) */}
      <meta name="twitter:card" content={cardType} />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
      <meta name="twitter:image:alt" content={fullTitle} />

      {/* WhatsApp, Google & Schema Microdata Fallbacks */}
      <meta itemProp="name" content={fullTitle} />
      <meta itemProp="description" content={desc} />
      <meta itemProp="image" content={img} />
      <link rel="image_src" href={img} />

      {/* Browser Theme & Mobile App Manifest */}
      <meta name="theme-color" content="#3169F5" />
      <meta name="msapplication-TileColor" content="#3169F5" />
      <meta name="msapplication-TileImage" content={`${SITE_URL}/icon-192.png`} />

      {/* Google Search Console ownership verification */}
      <meta name="google-site-verification" content="sRurRBK_qxB1q-UqsaETPM22-DJDUgYvwrB04Sngv7g" />

      {/* Branded icons (static files in /public, compressed/quantized for fast load) */}
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
      {/* viewport meta lives in pages/_document.js — Next.js requires it
          there, not per-page, so it isn't duplicated here. */}
    </Head>
  );
}
