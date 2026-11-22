import Link from "next/link";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import { fetchStorefrontProducts } from "../../lib/storefrontProducts";
import { slugifyProduct, extractProductId, getProductUrl } from "../../lib/productSlug";
import { toProductCode } from "../../lib/productLink";
import { SITE_URL } from "../../lib/siteConfig";
import { useT } from "../../lib/i18n";

export async function getServerSideProps({ params, res, locale = "en" }) {
  const { slug } = params || {};
  const productId = extractProductId(slug);

  if (!productId) {
    return { notFound: true };
  }

  let products = [];
  try {
    const { data, error } = await fetchStorefrontProducts();
    if (error) throw error;
    products = data || [];
  } catch (err) {
    console.error("[product/slug] Error fetching products:", err?.message);
    return { notFound: true };
  }

  // Match by id or slug
  const product = products.find(
    (p) => String(p.id) === String(productId) || slugifyProduct(p) === slug
  );

  if (!product) {
    return { notFound: true };
  }

  const canonicalSlug = slugifyProduct(product);

  // If accessed via non-canonical slug (like direct id /product/25), 301 redirect to canonical
  if (slug !== canonicalSlug) {
    const prefix = locale && locale !== "en" ? `/${locale}` : "";
    return {
      redirect: {
        destination: `${prefix}/product/${canonicalSlug}`,
        permanent: true,
      },
    };
  }

  // Related products from the same category or other featured items
  const related = products
    .filter((p) => String(p.id) !== String(product.id))
    .filter((p) => (product.category ? p.category === product.category : true))
    .slice(0, 4);

  // Set CDN edge caching for 5 minutes
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=86400"
  );

  const isForcedOut = Boolean(product.is_out_of_stock);

  return {
    props: {
      product: {
        id: String(product.id),
        code: toProductCode(product.id),
        title: product.title || "",
        description: product.description || product.short_description || "",
        shortDescription: product.short_description || "",
        price: Number(product.sell_price) || 0,
        availableStock: isForcedOut ? 0 : Number(product.available_stock || 0),
        inStock: !isForcedOut && (Number(product.available_stock || 0) > 0 || Boolean(product.tunvn_buff)),
        isOutOfStock: isForcedOut,
        category: product.category || "Digital Software",
        imageUrl: product.image_url || null,
        provider: product.provider || "internal",
        delivery: product.delivery || null,
        deliveryBadge: product.delivery_badge || null,
        autoDelivery: Boolean(product.auto_delivery),
        warranty: product.warranty || "100% Replacement Warranty",
        requiresEmail: Boolean(product.requires_email),
        activationField: product.activation_field || null,
        activationPlaceholder: product.activation_placeholder || null,
        updatedAt: product.updated_at ? product.updated_at.split("T")[0] : null,
      },
      related: related.map((p) => ({
        id: String(p.id),
        code: toProductCode(p.id),
        slug: slugifyProduct(p),
        title: p.title || "",
        price: Number(p.sell_price) || 0,
        imageUrl: p.image_url || null,
        category: p.category || null,
        inStock: !Boolean(p.is_out_of_stock) && (Number(p.available_stock || 0) > 0 || Boolean(p.tunvn_buff)),
      })),
      canonicalSlug,
    },
  };
}

export default function ProductDetailPage({ product, related, canonicalSlug }) {
  const { t } = useT();

  const isManual =
    product.deliveryBadge === "manual"
      ? true
      : product.deliveryBadge === "auto"
      ? false
      : product.provider === "manual" && !product.autoDelivery;

  const deliveryLabel = isManual
    ? product.delivery || t("Manual delivery within 1–6 hours")
    : t("Instant 0-second delivery");

  // Clean title for SEO
  const cleanTitle = (product.title || "")
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
    .trim();

  const pageTitle = `${cleanTitle} – Buy with Crypto (USDT) | DigiVerse`;
  const pageDescription = `Buy ${cleanTitle} at DigiVerse for \$${product.price.toFixed(2)} USDT. ${
    product.inStock ? "In stock with " + deliveryLabel + "." : ""
  } Secure checkout via USDT & USDC across BNB Chain, Polygon, Base, with 100% replacement warranty.`;

  const canonicalUrl = `${SITE_URL}/product/${canonicalSlug}`;
  const checkoutUrl = `/?product=${product.code}`;

  // Structured Data: Schema.org Product, Offer, BreadcrumbList, FAQPage
  const productSchema = {
    "@type": "Product",
    name: cleanTitle,
    image: product.imageUrl || `${SITE_URL}/og-preview.jpg`,
    description: pageDescription,
    sku: `DV-${product.id}`,
    brand: {
      "@type": "Brand",
      name: "DigiVerse",
    },
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "USD",
      price: product.price.toFixed(2),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "DigiVerse",
        url: SITE_URL,
      },
      priceValidUntil: "2027-12-31",
    },
  };

  const breadcrumbsSchema = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: product.category || "Store",
        item: `${SITE_URL}/#catalog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: cleanTitle,
        item: canonicalUrl,
      },
    ],
  };

  const faqSchema = {
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How do I receive ${cleanTitle} after payment?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: isManual
            ? `This product is fulfilled manually by our support team within 1 to 6 hours. You will receive your access credentials or activation link directly in your DigiVerse account dashboard under My Orders.`
            : `Delivery is 100% automated and instant. As soon as your crypto transaction or wallet balance payment is confirmed, your license key or access code is claimed and displayed immediately on your screen and saved to My Orders.`,
        },
      },
      {
        "@type": "Question",
        name: "Which payment methods are accepted?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "We accept USDT and USDC across BNB Smart Chain (BEP20), Polygon PoS, and Base (Coinbase L2) with zero processing fees. You can also pay instantly using your DigiVerse account wallet balance.",
        },
      },
      {
        "@type": "Question",
        name: "What warranty or replacement guarantee is provided?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Every license and digital product on DigiVerse includes our ${product.warranty}. If you encounter any unexpected issues, our 24/7 support team provides an instant replacement or resolution via live support ticket or Telegram.`,
        },
      },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [productSchema, breadcrumbsSchema, faqSchema],
  };

  return (
    <>
      <SEO
        title={pageTitle}
        description={pageDescription}
        path={`/product/${canonicalSlug}`}
        image={product.imageUrl || `${SITE_URL}/og-preview.jpg`}
        keywords={`${cleanTitle.toLowerCase()}, buy ${cleanTitle.toLowerCase()}, ${cleanTitle.toLowerCase()} crypto, ${cleanTitle.toLowerCase()} usdt, cheap license keys, digiverse`}
        jsonLd={jsonLd}
      />

      <div className="min-h-screen bg-bg text-ink flex flex-col">
        <SiteHeader />

        <main className="flex-1">
          <PageContainer>
            {/* Breadcrumb Navigation */}
            <nav
              aria-label="Breadcrumb"
              className="py-4 text-xs sm:text-sm text-muted flex items-center gap-1.5 flex-wrap"
            >
              <Link href="/" className="hover:text-brand transition-colors">
                {t("Home")}
              </Link>
              <span className="text-border" aria-hidden="true">/</span>
              <Link href="/#catalog" className="hover:text-brand transition-colors">
                {product.category || t("Store")}
              </Link>
              <span className="text-border" aria-hidden="true">/</span>
              <span className="text-ink font-medium truncate max-w-[260px] sm:max-w-none">
                {product.title}
              </span>
            </nav>

            {/* Product Hero Section */}
            <div className="mt-2 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pb-12 pt-4">
              {/* Product Visual / Image Column */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="w-full aspect-square max-w-[420px] rounded-3xl border border-border/80 bg-surface p-6 shadow-card flex items-center justify-center relative overflow-hidden group">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={cleanTitle}
                      className="w-full h-full object-contain rounded-2xl transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-soft to-brand/10 text-5xl font-extrabold text-brand shadow-inner ring-1 ring-border/80">
                      {cleanTitle.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {product.inStock ? (
                    <span className="absolute top-4 start-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 backdrop-blur-xs">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{t("In Stock")}</span>
                    </span>
                  ) : (
                    <span className="absolute top-4 start-4 inline-flex items-center gap-1 rounded-full bg-danger px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs">
                      {t("Sold Out")}
                    </span>
                  )}

                  <span className="absolute bottom-4 end-4 text-[11px] font-mono text-muted bg-bg/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-border">
                    ID: #{product.id}
                  </span>
                </div>

                {/* Trust Highlights under image */}
                <div className="w-full max-w-[420px] mt-6 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl border border-border/80 bg-surface p-3.5 flex items-center gap-2.5">
                    <span className="text-lg" aria-hidden="true">⚡</span>
                    <div>
                      <div className="font-semibold text-ink">{isManual ? t("Assisted Setup") : t("Instant Delivery")}</div>
                      <div className="text-[11px] text-muted">{isManual ? t("1–6 hours") : t("0-second automated")}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-surface p-3.5 flex items-center gap-2.5">
                    <span className="text-lg" aria-hidden="true">🛡️</span>
                    <div>
                      <div className="font-semibold text-ink">{t("Full Warranty")}</div>
                      <div className="text-[11px] text-muted">{product.warranty}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Details & Purchase Action Column */}
              <div className="lg:col-span-7 flex flex-col justify-start">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="rounded-full bg-brand-soft border border-brand/20 px-3 py-1 text-xs font-semibold text-brand">
                    {product.category}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border ${
                      isManual
                        ? "bg-warning-soft text-warning border-warning/20"
                        : "bg-success-soft text-success border-success/20"
                    }`}
                  >
                    <span>{isManual ? "🕒" : "⚡"}</span>
                    <span>{deliveryLabel}</span>
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-ink leading-tight">
                  {product.title}
                </h1>

                {/* Price Display */}
                <div className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-card">
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <div>
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider block">
                        {t("Price")}
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5" dir="ltr">
                        <span className="font-mono text-3xl sm:text-4xl font-extrabold text-ink">
                          ${product.price.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-muted uppercase">USDT / USDC</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-medium text-muted block">{t("Zero Payment Fees")}</span>
                      <span className="text-xs font-semibold text-success block mt-0.5">
                        ✓ {t("Automated On-Chain Verification")}
                      </span>
                    </div>
                  </div>

                  {/* Multi-Network Support Indicator */}
                  <div className="mt-4 pt-4 border-t border-border/80 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
                    <span className="font-medium text-ink">{t("Accepted Networks:")}</span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-bg border border-border px-2 py-0.5 font-semibold text-ink">
                        <img src="/crypto/bsc.svg" alt="BSC" className="h-3.5 w-3.5" />
                        <span>BNB Chain</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-bg border border-border px-2 py-0.5 font-semibold text-ink">
                        <img src="/crypto/polygon.svg" alt="Polygon" className="h-3.5 w-3.5" />
                        <span>Polygon</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-bg border border-border px-2 py-0.5 font-semibold text-ink">
                        <img src="/crypto/base.svg" alt="Base" className="h-3.5 w-3.5" />
                        <span>Base</span>
                      </span>
                    </div>
                  </div>

                  {/* Buy CTA */}
                  <div className="mt-5">
                    {product.inStock ? (
                      <Link
                        href={checkoutUrl}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3.5 px-6 font-bold text-base text-white shadow-md transition-all hover:bg-brand-hover hover:shadow-lg active:scale-[0.99]"
                      >
                        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <span>{t("Buy Now with USDT / Crypto")}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-xl bg-bg border border-border py-3.5 px-6 font-bold text-base text-muted cursor-not-allowed"
                      >
                        {t("Currently Sold Out")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Description & Specs */}
                <div className="mt-8 space-y-4">
                  <h2 className="text-lg font-bold text-ink">{t("Product Overview & Details")}</h2>
                  <div className="rounded-2xl border border-border/80 bg-surface p-5 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap">
                    {product.description || t("Genuine digital license with instant fulfillment and verified replacement guarantee.")}
                  </div>

                  {/* Specifications List */}
                  <div className="rounded-2xl border border-border/80 bg-surface p-5 text-xs sm:text-sm space-y-3">
                    <div className="flex items-center justify-between py-1 border-b border-border/60">
                      <span className="text-muted">{t("Product Type")}</span>
                      <span className="font-semibold text-ink">{product.category}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-border/60">
                      <span className="text-muted">{t("Fulfillment Mode")}</span>
                      <span className="font-semibold text-ink">{deliveryLabel}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-border/60">
                      <span className="text-muted">{t("Replacement Warranty")}</span>
                      <span className="font-semibold text-ink">{product.warranty}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted">{t("Supported Currencies")}</span>
                      <span className="font-semibold text-ink">USDT, USDC, Wallet Balance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product FAQs */}
            <section className="mt-8 border-t border-border pt-12 pb-12">
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-ink tracking-tight">
                    {t("Frequently Asked Questions")}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {t("Everything you need to know about purchasing {title} on DigiVerse.", { title: cleanTitle })}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                    <h3 className="font-semibold text-sm sm:text-base text-ink">
                      {t("How is this product delivered?")}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
                      {isManual
                        ? t("This product is fulfilled manually by our support team within 1 to 6 hours. You will receive your access credentials or activation link directly in your DigiVerse account dashboard under My Orders.")
                        : t("Delivery is 100% automated and instant. As soon as your crypto transaction or wallet balance payment is confirmed, your license key or access code is claimed and displayed immediately on your screen and saved to My Orders.")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                    <h3 className="font-semibold text-sm sm:text-base text-ink">
                      {t("What payment methods are supported?")}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
                      {t("We accept USDT and USDC across BNB Smart Chain (BEP20), Polygon PoS, and Base (Coinbase L2) with zero processing fees. You can also pay instantly using your DigiVerse account wallet balance.")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                    <h3 className="font-semibold text-sm sm:text-base text-ink">
                      {t("What is the warranty policy?")}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
                      {t("Every product on DigiVerse comes with our full {warranty}. If you encounter any technical issue or key problem, our support team will replace it promptly or provide assistance through our 24/7 support desk.", { warranty: product.warranty })}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Related Products Section */}
            {related && related.length > 0 && (
              <section className="border-t border-border pt-12 pb-16">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
                      {t("Related Products")}
                    </h2>
                    <p className="text-xs sm:text-sm text-muted mt-0.5">
                      {t("More premium digital licenses in {category}", { category: product.category })}
                    </p>
                  </div>
                  <Link
                    href="/#catalog"
                    className="text-xs sm:text-sm font-semibold text-brand hover:underline"
                  >
                    {t("View all")} →
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {related.map((rel) => (
                    <Link
                      key={rel.id}
                      href={`/product/${rel.slug}`}
                      className="group rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-card-hover flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          {rel.imageUrl ? (
                            <img
                              src={rel.imageUrl}
                              alt=""
                              className="h-10 w-10 object-contain rounded-xl border border-border/80 bg-bg p-0.5"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-xl bg-brand-soft text-brand font-bold flex items-center justify-center text-sm">
                              {rel.title.charAt(0)}
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            {t("In Stock")}
                          </span>
                        </div>
                        <h3 className="font-bold text-sm text-ink line-clamp-2 group-hover:text-brand transition-colors">
                          {rel.title}
                        </h3>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/80 flex items-center justify-between">
                        <span className="font-mono font-bold text-base text-ink" dir="ltr">
                          ${rel.price.toFixed(2)}
                        </span>
                        <span className="text-xs font-semibold text-brand group-hover:translate-x-0.5 transition-transform">
                          {t("View Details")} →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </PageContainer>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}

