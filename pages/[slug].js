import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import PaymentPanel from "../components/PaymentPanel";
import DeliveredItems from "../components/ui/DeliveredItems";
import Alert from "../components/ui/Alert";
import { PrimaryButton, SecondaryButton } from "../components/ui/Button";
import { FormInput } from "../components/ui/FormInput";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import { slugifyProduct, extractProductId, getProductUrl } from "../lib/productSlug";
import { toProductCode, fromProductCode } from "../lib/productLink";
import { SITE_URL } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import { formatWarranty } from "../lib/formatWarranty";
import { getReferralSettings } from "../lib/referralSettings";
import { supabase } from "../lib/supabaseClient";
import * as fpixel from "../lib/fpixel";

const RESERVED_PATHS = new Set([
  "api",
  "admin",
  "account",
  "auth",
  "login",
  "signup",
  "about",
  "terms",
  "privacy",
  "blog",
  "reset-password",
  "muse-ai-tokens",
  "product",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
]);

export async function getServerSideProps({ params, res, locale = "en" }) {
  const { slug } = params || {};

  if (!slug || RESERVED_PATHS.has(slug)) {
    return { notFound: true };
  }

  const productId = extractProductId(slug);

  let products = [];
  try {
    const { data, error } = await fetchStorefrontProducts();
    if (error) throw error;
    products = data || [];
  } catch (err) {
    console.error("[pages/[slug]] Error fetching storefront products:", err?.message);
    return { notFound: true };
  }

  // Match by slug, generated slug, or product ID
  const product = products.find(
    (p) =>
      p.slug === slug ||
      slugifyProduct(p) === slug ||
      String(p.id) === String(productId)
  );

  if (!product) {
    return { notFound: true };
  }

  const canonicalSlug = slugifyProduct(product);

  // If accessed via non-canonical slug (like legacy /slug-54 or direct id /25), 301 redirect
  if (slug !== canonicalSlug) {
    const prefix = locale && locale !== "en" ? `/${locale}` : "";
    return {
      redirect: {
        destination: `${prefix}/${canonicalSlug}`,
        permanent: true,
      },
    };
  }

  const related = products
    .filter((p) => String(p.id) !== String(product.id))
    .filter((p) => (product.category ? p.category === product.category : true))
    .slice(0, 4);

  const refSettings = await getReferralSettings().catch(() => null);
  const referralEnabled = refSettings?.referral_enabled !== false;

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
        slug: canonicalSlug,
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
        warranty: product.warranty ? String(product.warranty).trim() : null,
        requiresEmail: Boolean(product.requires_email),
        activationField: product.activation_field || null,
        activationPlaceholder: product.activation_placeholder || null,
        minOrderQty: product.min_order_qty || 1,
        maxOrderQty: product.max_order_qty || null,
        tunvn_buff: Boolean(product.tunvn_buff),
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
      referralEnabled,
    },
  };
}

export default function ProductLandingPage({ product, canonicalSlug, related, referralEnabled }) {
  const router = useRouter();
  const { t, locale } = useT();

  const [session, setSession] = useState(null);
  const [step, setStep] = useState("form"); // 'form' | 'summary' | 'order' | 'done'
  const [quantity, setQuantity] = useState("1");
  const [email, setEmail] = useState("");
  const [activationInfo, setActivationInfo] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null);
  const [manual, setManual] = useState(false);
  const [creating, setCreating] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [availableGiftsData, setAvailableGiftsData] = useState(null);
  const [giftsToRedeem, setGiftsToRedeem] = useState(0);
  const [buffState, setBuffState] = useState(null);
  const [ticker, setTicker] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.buy_modal_ticker) setTicker(d.buy_modal_ticker);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.email) {
        setEmail(data.session.user.email);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user?.email) {
        setEmail(s.user.email);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Check gift box availability for Muse AI tokens
  useEffect(() => {
    let active = true;
    if (product.tunvn_buff || String(product.id) === "-12") {
      fetch("/api/wallet/gifts/available")
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          if (d?.eligible && d?.max_redeemable > 0) {
            setAvailableGiftsData(d);
            setGiftsToRedeem(1);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [product.id, product.tunvn_buff]);

  // Track Muse AI token buff delivery status
  useEffect(() => {
    if (step !== "done" || !product?.tunvn_buff || !order?.id) return;
    let stop = false;
    async function check() {
      try {
        const res = await fetch("/api/orders/buff-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (stop) return;
        if (data.status === "completed") {
          setBuffState("done");
          return;
        }
        if (data.status === "failed") {
          setBuffState("failed");
          return;
        }
        setTimeout(check, 3000);
      } catch {
        if (!stop) setTimeout(check, 4000);
      }
    }
    setBuffState("polling");
    check();
    return () => {
      stop = true;
    };
  }, [step, product?.tunvn_buff, order?.id]);

  const isManual =
    product.deliveryBadge === "manual"
      ? true
      : product.deliveryBadge === "auto"
      ? false
      : product.provider === "manual" && !product.autoDelivery;

  const deliveryLabel = isManual
    ? product.delivery || t("Manual delivery within 1–6 hours")
    : t("Instant 0-second delivery");

  const cleanTitle = (product.title || "")
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
    .trim();

  const pageTitle = `${cleanTitle} – Buy with Crypto (USDT) | DigiVerse`;
  const pageDescription = `Buy ${cleanTitle} at DigiVerse for \$${product.price.toFixed(2)} USDT. ${
    product.inStock ? "In stock with " + deliveryLabel + "." : ""
  } Secure checkout via USDT & USDC across BNB Chain, Polygon, Base with full customer support.`;

  const canonicalUrl = `${SITE_URL}/${canonicalSlug}`;

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

  const faqList = [
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
      name: "What is the warranty policy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Warranty terms and duration vary by product and are clearly stated in each product's description. If you encounter any technical issue or key problem during the stated warranty period, our support team will replace it promptly or provide assistance through our 24/7 support desk.`,
      },
    },
  ];

  if (referralEnabled) {
    faqList.push({
      "@type": "Question",
      name: "How does the free Referral Reward Box program work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When friends register through your personal referral link, you earn free gift boxes with 0-second instant unlock (zero lock delay). Each gift box redeems for 1 Billion Muse AI Tokens. Clicking “Claim Gift” on your referrals dashboard automatically applies your reward at checkout for an instant $0.00 total.",
      },
    });
  }

  const faqSchema = {
    "@type": "FAQPage",
    mainEntity: faqList,
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [productSchema, breadcrumbsSchema, faqSchema],
  };

  const parsedQty = parseInt(quantity, 10) || 0;
  const maxRedeemableGifts = availableGiftsData?.max_redeemable || 0;
  const effectiveGifts = Math.min(giftsToRedeem, maxRedeemableGifts, parsedQty || 1);
  const unitPriceNum = Number(product.price) || 0;
  const currentTotalQty = Math.max(parsedQty, effectiveGifts);
  const giftDiscountAmount = effectiveGifts * unitPriceNum;
  const paidQty = Math.max(0, currentTotalQty - effectiveGifts);
  const subtotal = Number((paidQty * unitPriceNum).toFixed(2));
  const total = (coupon ? coupon.final : subtotal).toFixed(2);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponError("");
    setCouponBusy(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponInput.trim(),
          product_id: product.id,
          amount: subtotal,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setCoupon(data);
      } else {
        setCoupon(null);
        setCouponError(describeError(t, data.error, undefined, data.min_order));
      }
    } catch {
      setCouponError(t("Couldn't check that code — try again."));
    } finally {
      setCouponBusy(false);
    }
  }

  function handleProceedToSummary(e) {
    e.preventDefault();
    setError("");

    if (parsedQty <= 0) {
      setError(t("Please enter a valid quantity."));
      return;
    }
    if (product.requiresEmail && !email) {
      setError(describeError(t, "email_required"));
      return;
    }
    if (isManual) {
      const minQty = product.minOrderQty ?? 1;
      const maxQty = product.maxOrderQty ?? null;
      if (parsedQty < minQty) {
        setError(describeError(t, "qty_below_minimum", undefined, undefined, undefined, minQty));
        return;
      }
      if (maxQty !== null && parsedQty > maxQty) {
        setError(describeError(t, "qty_exceeds_maximum", undefined, undefined, maxQty));
        return;
      }
      if (product.activationField && !activationInfo.trim()) {
        setError(describeError(t, "activation_info_required"));
        return;
      }
    }
    setStep("summary");
  }

  async function handleConfirmOrder() {
    setError("");
    setCreating(true);

    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          quantity: parsedQty,
          email: product.requiresEmail ? email : (session?.user?.email || null),
          activation_info: activationInfo,
          coupon_code: coupon ? coupon.code : undefined,
          gifts_to_redeem: effectiveGifts,
        }),
      });
      const data = await res.json();
      setCreating(false);

      if (!data.success) {
        const errMsg = data.message || describeError(t, data.error, data.available, data.min_order, data.max_qty);
        setError(errMsg);
        if (data.max_qty !== undefined && Number(data.max_qty) >= 0) {
          if (Number(data.max_qty) > 0) {
            setQuantity(String(data.max_qty));
          }
        }
        setCoupon(null);
        setStep("form");
        return;
      }

      setOrder(data.order);

      // Order fully paid (e.g. 100% gift box or auto-claim)
      if (data.order?.status && data.order.status !== "pending_payment") {
        fpixel.event("Purchase", {
          content_name: product.title,
          content_ids: [String(product.id)],
          content_type: "product",
          value: Number(data.order?.total) || 0,
          currency: "USD",
          num_items: parseInt(quantity, 10) || 1,
        });
        setItems(data.items || data.order.items || []);
        setManual(data.manual !== undefined ? data.manual : (data.order.manual || false));
        setStep("done");
        return;
      }

      fpixel.event("InitiateCheckout", {
        content_name: product.title,
        content_ids: [String(product.id)],
        content_type: "product",
        value: Number(data.order?.total) || 0,
        currency: "USD",
        num_items: parseInt(quantity, 10) || 1,
      });

      setStep("order");
    } catch {
      setCreating(false);
      setError(t("Failed to create order. Please try again."));
      setStep("form");
    }
  }

  const stepLabels = {
    form: t("1. Details & Qty"),
    summary: t("2. Review Order"),
    order: t("3. Payment"),
    done: t("4. Delivery"),
  };

  return (
    <>
      <SEO
        title={pageTitle}
        description={pageDescription}
        path={`/${canonicalSlug}`}
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
                {cleanTitle}
              </span>
            </nav>

            {/* Main Product Showcase Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pb-16 items-start">
              {/* Product Info & Specifications (Left Column) */}
              <div className="lg:col-span-7 flex flex-col justify-start">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/80 border border-brand/20 px-3 py-1 text-xs font-semibold text-brand backdrop-blur-xs shadow-2xs">
                    {product.category}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border shadow-2xs ${
                      isManual
                        ? "bg-warning-soft text-warning border-warning/20"
                        : "bg-success-soft text-success border-success/20"
                    }`}
                  >
                    <span>{isManual ? "🕒" : "⚡"}</span>
                    <span>{deliveryLabel}</span>
                  </span>
                  {product.inStock && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-border/80 px-2.5 py-1 text-xs font-medium text-ink shadow-2xs">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                      </span>
                      <span>{t("Verified Stock")}</span>
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-ink leading-tight">
                  {product.title}
                </h1>

                {/* Visual Image / Letter Badge & Key Trust Highlights */}
                <div className="mt-6 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 rounded-2xl border border-border/80 bg-surface shadow-card hover:shadow-card-hover transition-all duration-300">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand/40 to-transparent" />

                  {product.imageUrl ? (
                    <div className="group/img relative flex-shrink-0">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border border-border/80 object-cover bg-bg p-1.5 shadow-2xs transition-transform duration-300 group-hover/img:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-br from-brand-soft to-white flex items-center justify-center text-3xl font-extrabold text-brand shadow-2xs border border-border/80 shrink-0">
                      {product.title.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 w-full sm:flex-1 text-xs">
                    <div className="rounded-xl border border-border/70 bg-bg/50 p-3 hover:border-brand/30 hover:bg-brand-soft/20 transition-all">
                      <span className="text-muted block text-[11px] font-medium flex items-center gap-1">
                        <span>⚡</span>
                        <span>{t("Fulfillment")}</span>
                      </span>
                      <span className="font-bold text-ink block mt-0.5 text-xs sm:text-sm">
                        {isManual ? t("Manual (1–6 hrs)") : t("Instant (0-sec)")}
                      </span>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-bg/50 p-3 hover:border-brand/30 hover:bg-brand-soft/20 transition-all">
                      <span className="text-muted block text-[11px] font-medium flex items-center gap-1">
                        <span>🛡️</span>
                        <span>{t("Warranty")}</span>
                      </span>
                      <span className="font-bold text-ink block mt-0.5 text-xs sm:text-sm truncate">
                        {formatWarranty(product.warranty)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description & Overview */}
                <div className="mt-8 space-y-4">
                  <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-card hover:shadow-card-hover transition-all duration-300">
                    <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-ink mb-3.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand text-xs ring-1 ring-brand/10">
                        📋
                      </span>
                      <span>{t("Product Overview & Details")}</span>
                    </h2>
                    <div className="rounded-xl border border-border/60 bg-bg/40 p-4 text-xs sm:text-sm leading-relaxed text-ink/90 whitespace-pre-wrap">
                      {product.description || t("Genuine digital license with instant fulfillment and verified replacement guarantee.")}
                    </div>
                  </div>

                  {/* Specifications List */}
                  <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-card space-y-3">
                    <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold text-ink mb-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-soft text-brand text-xs ring-1 ring-brand/10">
                        ⚙️
                      </span>
                      <span>{t("Specifications & Guarantee")}</span>
                    </h3>
                    <div className="divide-y divide-border/60 text-xs sm:text-sm">
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-muted flex items-center gap-1.5">
                          <span>📁</span>
                          <span>{t("Product Category")}</span>
                        </span>
                        <span className="font-semibold text-ink">{product.category}</span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-muted flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>{t("Fulfillment Mode")}</span>
                        </span>
                        <span className="font-semibold text-ink">{deliveryLabel}</span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-muted flex items-center gap-1.5">
                          <span>🛡️</span>
                          <span>{t("Warranty Policy")}</span>
                        </span>
                        <span className="font-semibold text-ink">{formatWarranty(product.warranty)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-muted flex items-center gap-1.5">
                          <span>🔒</span>
                          <span>{t("Payment Security")}</span>
                        </span>
                        <span className="font-semibold text-success flex items-center gap-1">
                          <span>✓</span>
                          <span>{t("On-Chain EVM RPC Verified")}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order & Checkout Section (Right Column) */}
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                <div className="relative overflow-hidden rounded-3xl border border-border/90 bg-surface p-5 sm:p-7 shadow-[0_10px_35px_-5px_rgba(23,33,58,0.06)] ring-1 ring-border/50 space-y-5 transition-all">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand/20 via-brand to-brand/20" />

                  {/* Step Progress Tracker */}
                  <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white shadow-xs">
                        {step === "form" ? "1" : step === "summary" ? "2" : step === "order" ? "3" : "✓"}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-ink">
                        {stepLabels[step]}
                      </span>
                    </div>
                    {(step === "summary" || step === "order") && (
                      <button
                        type="button"
                        onClick={() => setStep("form")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline transition-colors cursor-pointer"
                      >
                        ← {t("Change details")}
                      </button>
                    )}
                  </div>

                  {/* Scrolling ticker marquee — shown when admin has set announcement */}
                  {ticker && (
                    <div className="overflow-hidden rounded-xl border border-warning/30 bg-warning-soft/40 py-2 px-1 text-xs text-warning">
                      <div className="dv-ticker-track flex whitespace-nowrap font-medium">
                        <span className="inline-block px-4">📢 {ticker}</span>
                        <span className="inline-block px-4" aria-hidden="true">📢 {ticker}</span>
                        <span className="inline-block px-4" aria-hidden="true">📢 {ticker}</span>
                      </div>
                    </div>
                  )}

                  {/* ── CASE 1: OUT OF STOCK ── */}
                  {!product.inStock ? (
                    <div className="space-y-4 py-2">
                      <div className="rounded-2xl border border-danger/30 bg-danger/10 p-5 text-center space-y-2">
                        <span className="text-3xl block">⚠️</span>
                        <h3 className="font-bold text-base text-danger">{t("Currently Sold Out")}</h3>
                        <p className="text-xs text-muted leading-relaxed">
                          {t("This product is temporarily out of stock. We are restocking soon — please check back later or reach out to 24/7 support.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-xl bg-bg border border-border py-3.5 px-4 font-bold text-sm text-muted cursor-not-allowed opacity-60"
                      >
                        {t("Out of Stock")}
                      </button>
                    </div>
                  ) : (
                    /* ── CASE 2: IN STOCK CHECKOUT FLOW ── */
                    <>
                      {/* STEP 1: QUANTITY & DETAILS */}
                      {step === "form" && (
                        <form onSubmit={handleProceedToSummary} className="space-y-4">
                          {/* Unit Price */}
                          <div className="flex items-baseline justify-between rounded-2xl border border-border/80 bg-gradient-to-br from-bg/90 via-surface to-brand-soft/20 p-4 shadow-2xs" dir="ltr">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-0.5">
                                {t("Unit Price")}
                              </span>
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-mono text-3xl sm:text-4xl font-black text-ink">
                                  ${product.price.toFixed(2)}
                                </span>
                                <span className="text-xs font-bold text-muted uppercase">USDT / USDC</span>
                              </div>
                            </div>
                            <div className="text-end">
                              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success ring-1 ring-success/20">
                                <span>✓</span>
                                <span>{t("Zero Payment Fees")}</span>
                              </span>
                            </div>
                          </div>

                          {/* Free Gift Box auto-applied banner for Muse AI */}
                          {(product.tunvn_buff || String(product.id) === "-12") && availableGiftsData?.max_redeemable > 0 && (
                            <div className="rounded-xl border border-success/40 bg-success-soft/30 px-3.5 py-2.5 text-xs text-success flex items-center justify-between font-medium">
                              <span>🎁 {t("1 Free Gift Box auto-applied ({n} available)", { n: availableGiftsData.max_redeemable })}</span>
                              <button
                                type="button"
                                onClick={() => setGiftsToRedeem(giftsToRedeem > 0 ? 0 : 1)}
                                className="underline font-bold text-[11px] cursor-pointer"
                              >
                                {giftsToRedeem > 0 ? t("Don't use") : t("Use box")}
                              </button>
                            </div>
                          )}

                          {/* Quantity Selector */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <label className="font-bold text-ink">{t("Quantity")}</label>
                              {product.availableStock > 0 && !product.tunvn_buff && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted border border-border">
                                  <span className="h-1.5 w-1.5 rounded-full bg-success"></span>
                                  <span>{product.availableStock} {t("available")}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setQuantity(String(Math.max(1, (parseInt(quantity, 10) || 1) - 1)))}
                                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/90 bg-surface text-ink hover:bg-brand-soft hover:border-brand/40 font-bold text-xl shadow-2xs active:scale-95 transition-all cursor-pointer"
                                aria-label="Decrease quantity"
                              >
                                –
                              </button>
                              <input
                                type="number"
                                min={product.minOrderQty || 1}
                                max={product.maxOrderQty || undefined}
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="h-11 flex-1 rounded-xl border border-border/90 bg-bg px-3 text-center font-mono text-lg font-extrabold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all shadow-inner"
                              />
                              <button
                                type="button"
                                onClick={() => setQuantity(String((parseInt(quantity, 10) || 0) + 1))}
                                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/90 bg-surface text-ink hover:bg-brand-soft hover:border-brand/40 font-bold text-xl shadow-2xs active:scale-95 transition-all cursor-pointer"
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Customer Email — only shown if this product explicitly requires it */}
                          {product.requiresEmail && (
                            <FormInput
                              label={t("Your Email Address")}
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="you@example.com"
                              required
                              hint={t("Your order receipt and access keys will be sent here.")}
                            />
                          )}

                          {/* Activation Info (e.g. invite link, username) */}
                          {product.activationField && (
                            <FormInput
                              label={t(product.activationField)}
                              value={activationInfo}
                              onChange={(e) => setActivationInfo(e.target.value)}
                              placeholder={product.activationPlaceholder || t("Enter {field}", { field: product.activationField })}
                              required
                              hint={product.tunvn_buff ? t("Paste your Muse AI invite link to receive tokens.") : undefined}
                            />
                          )}

                          {/* Coupon Code Accordion */}
                          <div className="space-y-1.5 pt-1">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={couponInput}
                                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                                placeholder={t("Discount Code")}
                                className="h-10 flex-1 rounded-xl border border-border/80 bg-bg px-3 text-xs font-mono uppercase text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all"
                              />
                              {coupon ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCoupon(null);
                                    setCouponInput("");
                                  }}
                                  className="h-10 px-4 rounded-xl border border-danger/30 text-danger text-xs font-bold hover:bg-danger/10 transition-colors cursor-pointer"
                                >
                                  {t("Remove")}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={applyCoupon}
                                  disabled={couponBusy || !couponInput.trim()}
                                  className="h-10 px-4 rounded-xl bg-surface border border-border text-ink hover:border-brand hover:bg-brand-soft/40 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  {couponBusy ? t("Checking…") : t("Apply")}
                                </button>
                              )}
                            </div>
                            {coupon && (
                              <p className="text-xs text-success font-medium">
                                ✓ {t("Coupon applied: save ${n}", { n: (subtotal - coupon.final).toFixed(2) })}
                              </p>
                            )}
                            {couponError && <p className="text-xs text-danger">{couponError}</p>}
                          </div>

                          {/* Subtotal & Total Preview */}
                          <div className="rounded-2xl border border-border/80 bg-bg/50 p-4 space-y-2 text-xs">
                            <div className="flex justify-between text-muted">
                              <span>{t("Subtotal")}</span>
                              <span className="font-mono text-ink">${(parsedQty * unitPriceNum).toFixed(2)}</span>
                            </div>
                            {giftDiscountAmount > 0 && (
                              <div className="flex justify-between text-emerald-600 font-medium">
                                <span>🎁 {t("Gift Box Discount")}</span>
                                <span className="font-mono">-${giftDiscountAmount.toFixed(2)}</span>
                              </div>
                            )}
                            {coupon && (
                              <div className="flex justify-between text-emerald-600 font-medium">
                                <span>🏷️ {t("Coupon Discount")}</span>
                                <span className="font-mono">-${(subtotal - coupon.final).toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between pt-2 border-t border-border/70 text-sm font-bold text-ink items-baseline">
                              <span>{t("Total Amount")}</span>
                              <div className="text-end">
                                <span className="font-mono text-2xl font-black text-brand">${total}</span>
                                <span className="text-xs font-bold text-muted ms-1">USDT</span>
                              </div>
                            </div>
                          </div>

                          <Alert variant="error">{error}</Alert>

                          <button
                            type="submit"
                            className="group relative flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(49,105,245,0.35)] transition-all duration-200 hover:from-brand-dark hover:to-indigo-700 hover:shadow-[0_6px_22px_rgba(49,105,245,0.45)] active:scale-[0.98] cursor-pointer"
                          >
                            <span>{t("Continue to Review")}</span>
                            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                          </button>

                          {/* Buyer Trust Micro-Strip */}
                          <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[10px] text-muted font-medium">
                            <div className="rounded-lg bg-bg/60 border border-border/60 py-1.5 px-1">
                              <span className="block text-xs mb-0.5">⚡</span>
                              <span>Instant Stock</span>
                            </div>
                            <div className="rounded-lg bg-bg/60 border border-border/60 py-1.5 px-1">
                              <span className="block text-xs mb-0.5">🛡️</span>
                              <span>Warranty</span>
                            </div>
                            <div className="rounded-lg bg-bg/60 border border-border/60 py-1.5 px-1">
                              <span className="block text-xs mb-0.5">🔒</span>
                              <span>0% EVM Fee</span>
                            </div>
                          </div>
                        </form>
                      )}

                      {/* STEP 2: ORDER SUMMARY CONFIRM */}
                      {step === "summary" && (
                        <div className="space-y-4 text-sm">
                          <div className="rounded-2xl border border-border/80 divide-y divide-border/60 bg-bg/40 text-xs overflow-hidden">
                            <div className="p-3.5 flex justify-between items-center">
                              <span className="text-muted">{t("Product")}</span>
                              <span className="font-semibold text-ink text-end max-w-[220px] truncate">{product.title}</span>
                            </div>
                            <div className="p-3.5 flex justify-between items-center">
                              <span className="text-muted">{t("Quantity")}</span>
                              <span className="font-mono font-bold text-ink text-sm">{parsedQty}</span>
                            </div>
                            {product.requiresEmail && email && (
                              <div className="p-3.5 flex justify-between items-center">
                                <span className="text-muted">{t("Email")}</span>
                                <span className="font-mono text-ink truncate max-w-[200px]">{email}</span>
                              </div>
                            )}
                            {activationInfo && (
                              <div className="p-3.5 flex justify-between items-center">
                                <span className="text-muted">{product.activationField || t("Activation")}</span>
                                <span className="font-mono text-ink truncate max-w-[200px]">{activationInfo}</span>
                              </div>
                            )}
                            <div className="p-3.5 flex justify-between items-baseline text-sm font-bold bg-surface">
                              <span className="text-ink">{t("Total to Pay")}</span>
                              <div className="text-end">
                                <span className="font-mono text-xl font-black text-brand">${total}</span>
                                <span className="text-xs font-bold text-muted ms-1">USDT</span>
                              </div>
                            </div>
                          </div>

                          <Alert variant="error">{error}</Alert>

                          <div className="flex gap-3">
                            <SecondaryButton onClick={() => setStep("form")} className="flex-1 py-3 text-xs font-bold">
                              ← {t("Back")}
                            </SecondaryButton>
                            <button
                              type="button"
                              onClick={handleConfirmOrder}
                              disabled={creating}
                              className="group flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-indigo-600 py-3 text-xs font-bold text-white shadow-md hover:from-brand-dark hover:to-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                            >
                              <span>{creating ? t("Creating order…") : t("Confirm & Pay")}</span>
                              {!creating && <span className="group-hover:translate-x-0.5 transition-transform">→</span>}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STEP 3: PAYMENT */}
                      {step === "order" && order && (
                        <PaymentPanel
                          order={order}
                          product={product}
                          onBack={() => setStep("form")}
                          onDone={(result) => {
                            setOrder((prev) => (prev ? { ...prev, status: "paid" } : prev));
                            fpixel.event("Purchase", {
                              content_name: product.title,
                              content_ids: [String(order.product_id)],
                              content_type: "product",
                              value: Number(order.total) || 0,
                              currency: "USD",
                              num_items: Number(order.quantity) || 1,
                            });
                            setItems(result.items);
                            setManual(result.manual);
                            setStep("done");
                          }}
                        />
                      )}

                      {/* STEP 4: DELIVERY */}
                      {step === "done" && (
                        <div className="space-y-4 text-sm">
                          <div className="rounded-xl border border-success/30 bg-success-soft/20 p-4 text-center space-y-1">
                            <span className="text-3xl block">🎉</span>
                            <h3 className="font-bold text-base text-ink">{t("Payment Confirmed!")}</h3>
                            <p className="text-xs font-mono text-muted">
                              {t("Order #{n}", { n: order?.order_number || String(order?.id || "").slice(0, 8).toUpperCase() })}
                            </p>
                          </div>

                          {/* TunVN Buff Delivery Status */}
                          {product.tunvn_buff && buffState === "done" && (
                            <Alert variant="success">
                              🎉 <strong>{t("Tokens delivered successfully!")}</strong> {t("The Muse AI tokens have been credited to your account.")}
                            </Alert>
                          )}
                          {product.tunvn_buff && buffState === "polling" && (
                            <Alert variant="success">
                              <div className="flex items-center gap-2">
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                                <span>{t("Processing token delivery to your invite link…")}</span>
                              </div>
                            </Alert>
                          )}

                          {/* Digital Stock Key Display */}
                          {items && items.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
                                {t("Your Delivered Items")}
                              </h4>
                              <DeliveredItems items={items} />
                            </div>
                          )}

                          {/* Manual Delivery Notice */}
                          {manual && (
                            <Alert variant="info">
                              {t("This order requires manual dispatch. Our support team is fulfilling it within 1–6 hours. You can track updates in your Orders tab.")}
                            </Alert>
                          )}

                          <div className="pt-2 flex flex-col gap-2">
                            <Link
                              href="/account/orders"
                              className="w-full text-center py-2.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand-hover shadow-sm transition-all"
                            >
                              {t("View in My Orders →")}
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setStep("form");
                                setOrder(null);
                                setItems(null);
                                setQuantity("1");
                              }}
                              className="w-full text-center py-2 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                            >
                              {t("Place Another Order")}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Product FAQ Section (Placed directly after details & quantity / checkout section) */}
            <section className="mt-14 pt-10 border-t border-border">
              <div className="max-w-3xl mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
                  {t("Frequently Asked Questions")}
                </h3>
                <p className="text-xs sm:text-sm text-muted mt-1">
                  {t("Common questions about purchasing and receiving {title}.", { title: cleanTitle })}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {faqList.map((item, idx) => (
                  <div key={idx} className="rounded-2xl border border-border bg-surface p-5 shadow-xs text-xs sm:text-sm">
                    <h4 className="font-semibold text-ink text-sm sm:text-base mb-2">{item.name}</h4>
                    <p className="text-muted leading-relaxed">{item.acceptedAnswer.text}</p>
                  </div>
                ))}
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
                  <Link href="/#catalog" className="text-xs sm:text-sm font-semibold text-brand hover:underline">
                    {t("View all")} →
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {related.map((rel) => (
                    <Link
                      key={rel.id}
                      href={`/${rel.slug}`}
                      className="group rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-card-hover flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          {rel.imageUrl ? (
                            <img
                              src={rel.imageUrl}
                              alt=""
                              className="h-10 w-10 rounded-xl border border-border object-cover bg-bg p-0.5"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-xl bg-brand-soft text-brand font-bold flex items-center justify-center text-sm">
                              {rel.title.charAt(0)}
                            </div>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rel.inStock ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-danger bg-danger/10"}`}>
                            {rel.inStock ? t("In Stock") : t("Sold out")}
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
                          {t("Buy")} →
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
