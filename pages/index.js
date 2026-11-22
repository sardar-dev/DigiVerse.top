import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import RecentOrders from "../components/RecentOrders";
import StorefrontFAQ, { FAQ_DATA } from "../components/StorefrontFAQ";
import SEO from "../components/SEO";
import { toProductCode, fromProductCode } from "../lib/productLink";
import { slugifyProduct, getProductUrl } from "../lib/productSlug";
import { useToast } from "../components/ui/Toast";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import ProductCard from "../components/ui/ProductCard";
import Alert from "../components/ui/Alert";
import { PrimaryButton, SecondaryButton } from "../components/ui/Button";
import { EmptyState, ErrorState } from "../components/ui/States";
import { SITE_NAME, SITE_TAGLINE, SITE_URL, SITE_DESCRIPTION } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import { getReferralSettings } from "../lib/referralSettings";

// Server-rendered so search engines (and the first paint) see the
// actual product list immediately, not an empty page that fills in
// after a client-side fetch.
export async function getServerSideProps({ query, locale, res }) {
  // Same list for every visitor, so let Vercel's edge serve it for 30s
  // (and refresh in the background) instead of querying the database on
  // every page view.
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
  const { data } = await fetchStorefrontProducts();
  const list = data || [];

  // Permanent 301 redirect legacy /?product=<id> or /?buy=<id> queries
  // to dedicated SEO-optimized product pages (e.g. /buy-muse-ai-tokens).
  const rawParam = query?.product || query?.buy;
  if (rawParam) {
    const rawId = fromProductCode(rawParam);
    const matched = list.find(
      (p) =>
        String(p.id) === String(rawId) ||
        String(p.id) === String(rawParam) ||
        p.slug === rawParam
    );
    if (matched) {
      const prefix = locale && locale !== "en" ? `/${locale}` : "";
      return {
        redirect: {
          destination: `${prefix}/${slugifyProduct(matched)}`,
          permanent: true,
          basePath: false,
        },
      };
    }
  }

  const refSettings = await getReferralSettings().catch(() => null);
  const referralEnabled = refSettings?.referral_enabled !== false;

  return { props: { initialProducts: list, referralEnabled } };
}

export default function Storefront({ initialProducts, referralEnabled: initialReferralEnabled }) {
  const router = useRouter();
  const { t, locale } = useT();
  const { notify } = useToast();
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState(initialProducts || []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(""); // "" = all
  const [sharedNotFound, setSharedNotFound] = useState(false);
  const [adminMessages, setAdminMessages] = useState([]);
  const [referralEnabled, setReferralEnabled] = useState(initialReferralEnabled !== false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    // Quiet background refresh — we already have server-rendered data
    // to show, this just keeps stock/price current without a loading
    // flash. Falls back to a visible error only if we truly have
    // nothing to show.
    loadProducts(products.length === 0);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.referral_enabled === "boolean") setReferralEnabled(d.referral_enabled);
      })
      .catch(() => {});
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch admin messages for logged-in users
  useEffect(() => {
    if (!session) return;
    fetch("/api/messages/inbox")
      .then((r) => r.json())
      .then((d) => { if (d.success) setAdminMessages(d.messages || []); })
      .catch(() => {});
  }, [session]);

  // Pre-fill search if ?q= is provided
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.q;
    if (typeof q === "string" && q.trim()) setSearch(q.trim().slice(0, 60));
  }, [router.isReady, router.query.q]);

  // Client-side fallback redirect for legacy product query links
  useEffect(() => {
    if (!router.isReady) return;
    const rawParam = router.query.product || router.query.buy;
    if (!rawParam || products.length === 0) return;

    const match = products.find(
      (p) =>
        String(p.id) === fromProductCode(rawParam) ||
        String(p.id) === String(rawParam) ||
        p.slug === rawParam
    );
    if (match) {
      router.replace(getProductUrl(match));
    } else {
      setSharedNotFound(true);
    }
  }, [router.isReady, router.query.product, router.query.buy, products]);

  function loadProducts(showLoadingState = true) {
    if (showLoadingState) setLoading(true);
    setLoadError(false);
    fetch("/api/products")
      .then((r) => {
        if (!r.ok) throw new Error("bad_status");
        return r.json();
      })
      .then((d) => {
        if (!d.success) throw new Error("bad_response");
        setProducts(d.products || []);
      })
      .catch(() => {
        if (products.length === 0) setLoadError(true);
      })
      .finally(() => setLoading(false));
  }

  // Categories derived from whatever's already in `products` — no
  // extra query, no separate table. Only shown once there's more
  // than one category worth filtering between.
  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  const categoryCounts = useMemo(() => {
    const counts = { "": products.length };
    for (const p of products) {
      if (p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    }
    return counts;
  }, [products]);

  // Filtering happens entirely in the browser — no extra requests to
  // our server per keystroke, since we already have the full list.
  const inStock = useMemo(() => products.filter((p) => p.available_stock > 0), [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.short_description || "").toLowerCase().includes(q)
      );
    });
  }, [products, search, category]);

  // Cheapest live price of the Muse top-up (per 1 billion tokens). Falls back
  // to the launch price if the catalog has no priced top-up product.
  const musePrice = useMemo(() => {
    const prices = (products || [])
      .filter((p) => p.tunvn_buff)
      .map((p) => Number(p.sell_price ?? p.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    return prices.length ? Math.min(...prices) : 0.15;
  }, [products]);
  const musePriceText = `$${musePrice.toFixed(2)}`;

  const storeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "DigiVerse",
        url: SITE_URL,
        logo: `${SITE_URL}/logo-mark.png`,
        description: SITE_DESCRIPTION,
        sameAs: ["https://t.me/digiverse_top"],
        knowsAbout: [
          "Digital Software Licenses",
          "Operating Systems (Windows 11, Windows 10)",
          "Productivity Software Suites",
          "Muse AI Tokens",
          "Cryptocurrency Payments (USDT, USDC on BEP20, Polygon, Base)",
          "Instant License Key Fulfillment",
        ],
        paymentAccepted: [
          "USDT (BNB Smart Chain BEP20)",
          "USDT (Polygon PoS)",
          "USDT (Base L2)",
          "USDC (Polygon PoS)",
          "USDC (Base L2)",
          "DigiVerse Wallet Balance",
        ],
        currenciesAccepted: "USD",
        priceRange: "$0.50 - $99.00",
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          url: `${SITE_URL}/account/support`,
        },
      },
      {
        "@type": "WebSite",
        name: "DigiVerse",
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/?q={search_term_string}#catalog`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_DATA.filter((item) => referralEnabled || item.id !== "referral-rewards-program").map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
      {
        "@type": "HowTo",
        name: "How to Buy Software Licenses and Muse AI Tokens with Crypto on DigiVerse",
        description:
          "Step-by-step instructions to buy genuine digital keys and Muse AI tokens with instant 0-second delivery using USDT, USDC, or wallet balance.",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Choose Your Product",
            text: "Explore the DigiVerse catalog, review prices, stock availability, and select your software license or Muse AI token package.",
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Select Crypto or Wallet Balance",
            text: "Select USDT or USDC across BNB Smart Chain (BEP20), Polygon PoS, or Base L2, or pay instantly with on-site wallet balance.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Confirm On-Chain Payment",
            text: "Send the exact deposit amount with zero processing fees. Our EVM verification engine validates the transaction directly on-chain.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Receive Instant 0-Second Delivery",
            text: "Your license key is instantly displayed on screen and stored in My Orders, or Muse AI tokens are automatically delivered to your account.",
          },
        ],
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        fullTitleOverride={`DigiVerse – Buy Muse AI Tokens from ${musePriceText} | Digital Subscriptions`}
        description={`Buy Muse AI Tokens on your own account from ${musePriceText} per 1 billion tokens. Invite code only, auto delivery in 10–15 minutes, USDT payment. Also Office 365, Canva, Gemini, Duolingo, STEAM and more at DigiVerse.top.`}
        keywords="digital software licenses, Muse AI tokens, buy Muse AI tokens, cheap license keys, Windows keys, office licenses, crypto software store, USDT digital goods, instant digital delivery, DigiVerse"
        jsonLd={storeJsonLd}
      />
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        {/* Admin message banners */}
        {adminMessages.length > 0 && (
          <AdminMessageBanner
            messages={adminMessages}
            onDismiss={(id) => setAdminMessages((prev) => prev.filter((m) => m.id !== id))}
            onReply={(id) => setAdminMessages((prev) => prev.filter((m) => m.id !== id))}
          />
        )}

        {/* Hero */}
        <HeroSection
          inStock={inStock}
          search={search}
          setSearch={setSearch}
        />

        {/* How it works */}
        <section id="how-it-works" className="relative border-b border-border bg-gradient-to-b from-surface via-bg/40 to-surface py-12 sm:py-16">
          <PageContainer>
            {/* Section Header */}
            <div className="text-center space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                {t("Simple 3-Step Process")}
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                {t("How it works")}
              </h2>
              <p className="mx-auto max-w-lg text-xs sm:text-sm text-muted leading-relaxed">
                {t("From choosing your digital product to instant delivery in under 60 seconds.")}
              </p>
            </div>

            {/* 3 Step Cards Grid */}
            <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 sm:gap-6">
              {/* Step 1 */}
              <li className="group relative flex flex-col justify-between rounded-2xl border border-border/85 bg-surface/95 p-6 sm:p-7 shadow-card backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-[0_16px_36px_-10px_rgba(49,105,245,0.18),0_0_0_1px_rgba(49,105,245,0.15)] before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-brand before:to-transparent before:opacity-0 group-hover:before:opacity-100 before:transition-opacity">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 via-brand/10 to-indigo-500/20 text-brand ring-1 ring-brand/20 shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-2deg]">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-bg/90 px-2.5 py-1 text-[11px] font-mono font-bold text-muted transition-colors group-hover:border-brand/40 group-hover:text-brand shadow-2xs">
                      <span className="text-[10px] text-muted/70 uppercase tracking-wider">STEP</span>
                      <span>01</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-ink transition-colors group-hover:text-brand">
                      {t("Choose a product")}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
                      {t("Browse our catalog of verified AI tokens, accounts, and software licenses. Prices and stock are shown upfront.")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/25 bg-success-soft px-2.5 py-1 text-success">
                    <span>⚡</span>
                    <span>{t("Instant Stock")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand-soft px-2.5 py-1 text-brand">
                    <span>🛡️</span>
                    <span>{t("Verified Warranty")}</span>
                  </span>
                </div>
              </li>

              {/* Step 2 */}
              <li className="group relative flex flex-col justify-between rounded-2xl border border-border/85 bg-surface/95 p-6 sm:p-7 shadow-card backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-purple-500/40 hover:shadow-[0_16px_36px_-10px_rgba(147,51,234,0.18),0_0_0_1px_rgba(147,51,234,0.15)] before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-purple-500 before:to-transparent before:opacity-0 group-hover:before:opacity-100 before:transition-opacity">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/15 via-violet-500/10 to-pink-500/20 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20 shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-2deg]">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="5" width="20" height="14" rx="3" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                        <circle cx="17" cy="14" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-bg/90 px-2.5 py-1 text-[11px] font-mono font-bold text-muted transition-colors group-hover:border-purple-500/40 group-hover:text-purple-600 dark:group-hover:text-purple-400 shadow-2xs">
                      <span className="text-[10px] text-muted/70 uppercase tracking-wider">STEP</span>
                      <span>02</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-ink transition-colors group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      {t("Pay with Crypto or Wallet")}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
                      {t("Pay securely with USDT or USDC across Polygon, Base, and BSC, or checkout in 1-click using your wallet balance.")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand-soft px-2.5 py-1 text-brand">
                    <span>💎</span>
                    <span>{t("Polygon · Base · BSC")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-purple-600 dark:text-purple-400">
                    <span>👛</span>
                    <span>{t("1-Click Balance")}</span>
                  </span>
                </div>
              </li>

              {/* Step 3 */}
              <li className="group relative flex flex-col justify-between rounded-2xl border border-border/85 bg-surface/95 p-6 sm:p-7 shadow-card backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-emerald-500/40 hover:shadow-[0_16px_36px_-10px_rgba(16,185,129,0.18),0_0_0_1px_rgba(16,185,129,0.15)] before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-emerald-500 before:to-transparent before:opacity-0 group-hover:before:opacity-100 before:transition-opacity">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-cyan-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-2deg]">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-bg/90 px-2.5 py-1 text-[11px] font-mono font-bold text-muted transition-colors group-hover:border-emerald-500/40 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shadow-2xs">
                      <span className="text-[10px] text-muted/70 uppercase tracking-wider">STEP</span>
                      <span>03</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-ink transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                      {t("Receive instantly")}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
                      {t("License keys and Muse AI tokens deliver automatically upon blockchain confirmation, saved permanently in My Orders.")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/25 bg-success-soft px-2.5 py-1 text-success">
                    <span>⚡</span>
                    <span>{t("0-Second Dispatch")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                    <span>📦</span>
                    <span>{t("Saved in Account")}</span>
                  </span>
                </div>
              </li>
            </ol>
          </PageContainer>
        </section>

        {/* Catalog */}
        <section id="catalog">
          <PageContainer className="py-10 sm:py-14">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                    {t("Products")}
                  </h2>
                  {products.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink shadow-2xs">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                      </span>
                      <span className="font-mono">{inStock.length}</span>
                      <span className="text-muted font-normal">{t("in stock")}</span>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs sm:text-sm text-muted">
                  {products.length > 0
                    ? t("{shown} of {total} shown", { shown: visible.length, total: products.length })
                    : t("Browse what's available")}
                </p>
              </div>

              {/* Search input with modern styling and SVG icons */}
              <div className="relative flex w-full items-center sm:w-72 md:w-80">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted" aria-hidden="true">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Search products…")}
                  aria-label={t("Search products")}
                  className="w-full rounded-xl border border-border/90 bg-surface py-2.5 pe-8 ps-9 text-xs sm:text-sm text-ink placeholder:text-muted/70 shadow-2xs transition-all duration-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t("Clear search")}
                    className="absolute inset-y-0 end-0 flex items-center pe-2.5 text-muted hover:text-ink transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Bar: Horizontal scroll on mobile, wrap on sm+ */}
            {categories.length > 1 && (
              <div
                className="mb-6 flex w-full max-w-full min-w-0 items-center gap-2 overflow-x-auto pb-2 pt-0.5 sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="group"
                aria-label={t("Filter by category")}
              >
                {["", ...categories].map((c) => {
                  const isSelected = category === c;
                  const count = categoryCounts[c] ?? 0;
                  return (
                    <button
                      key={c || "all"}
                      onClick={() => setCategory(c)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-150 active:scale-95 flex-shrink-0 ${
                        isSelected
                          ? "bg-brand text-white shadow-xs"
                          : "border border-border/80 bg-surface text-muted hover:border-brand-light/70 hover:text-ink hover:bg-brand-soft/40"
                      }`}
                    >
                      <span>{c || t("All")}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isSelected
                            ? "bg-white/25 text-white"
                            : "bg-bg border border-border/60 text-muted"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                {(category || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("");
                      setSearch("");
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-brand hover:border-brand transition-all flex-shrink-0 active:scale-95"
                  >
                    <span>✕</span>
                    <span>{t("Reset")}</span>
                  </button>
                )}
              </div>
            )}

            {loading && products.length === 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="dv-skeleton h-56 rounded-2xl border border-border" />
                ))}
              </div>
            )}

            {loadError && (
              <ErrorState
                title={t("Couldn't load products")}
                description={t("Something's wrong on our end — please try again.")}
                onRetry={() => loadProducts(true)}
              />
            )}

            {!loading && !loadError && products.length === 0 && (
              <EmptyState
                title={t("Nothing in stock right now")}
                description={t("Check back soon — new stock is added regularly.")}
              />
            )}

            {!loading && !loadError && products.length > 0 && visible.length === 0 && (
              <EmptyState
                title={search ? t('No products match "{q}"', { q: search }) : t("No products in this category")}
              />
            )}

            {sharedNotFound && (
              <Alert variant="warning" className="mb-4">
                {t("That shared product link isn't available anymore — it may be out of stock or removed.")}
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onShare={() => shareProduct(p, notify, t, locale)}
                />
              ))}
            </div>
          </PageContainer>
        </section>

        <RecentOrders />
        <StorefrontFAQ referralEnabled={referralEnabled} />
      </main>

      <SiteFooter />
    </div>
  );
}

function shareProduct(product, notify, t, locale) {
  const prefix = locale && locale !== "en" ? `/${locale}` : "";
  const url = `${window.location.origin}${prefix}/${slugifyProduct(product)}`;
  if (navigator.share) {
    navigator.share({ title: product.title, url }).catch(() => {});
    return;
  }
  navigator.clipboard
    ?.writeText(url)
    .then(() => notify?.(t("Product link copied! 🔗")))
    .catch(() => window.prompt(t("Copy this link:"), url));
}

// ── Hero section (extracted so mouse-glow useEffect stays isolated) ──────────
function HeroSection({ inStock, search, setSearch }) {
  const { t, locale } = useT();
  const sectionRef = useRef(null);
  const glowRef = useRef(null);

  // Mouse-follow spotlight — desktop/laptop only (hover-capable pointer).
  // On touch devices matchMedia fires false so the div stays hidden.
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!mq.matches) return; // touch / mobile — do nothing

    const section = sectionRef.current;
    const glow = glowRef.current;
    if (!section || !glow) return;

    let raf = null;
    let tx = -999, ty = -999; // off-screen initially

    function onMove(e) {
      const rect = section.getBoundingClientRect();
      tx = e.clientX - rect.left;
      ty = e.clientY - rect.top;
    }
    function onLeave() {
      // Fade out slowly when mouse leaves hero
      tx = -999; ty = -999;
    }
    function tick() {
      glow.style.setProperty("--gx", `${tx}px`);
      glow.style.setProperty("--gy", `${ty}px`);
      // Visibility: hidden when off-screen (avoids stuck glow at top-left)
      glow.style.opacity = tx < 0 ? "0" : "1";
      raf = requestAnimationFrame(tick);
    }

    section.addEventListener("mousemove", onMove, { passive: true });
    section.addEventListener("mouseleave", onLeave, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      section.removeEventListener("mousemove", onMove);
      section.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-soft via-surface to-surface"
    >
      {/* Mouse-follow spotlight — rendered only, shown via JS above */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(480px circle at var(--gx, -999px) var(--gy, -999px), rgba(49,105,245,0.13) 0%, rgba(124,92,255,0.07) 40%, transparent 70%)",
        }}
      />

      {/* Static background layers */}
      <div className="dv-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="dv-rings pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="dv-orb pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/20 blur-3xl sm:-right-24 sm:-top-24 sm:h-96 sm:w-96" aria-hidden="true" />
      <div className="dv-orb pointer-events-none absolute -left-16 top-32 h-56 w-56 rounded-full bg-violet-400/15 blur-3xl [animation-delay:2s] sm:-left-28 sm:top-40 sm:h-72 sm:w-72" aria-hidden="true" />
      <div className="dv-orb pointer-events-none absolute bottom-0 right-1/3 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl [animation-delay:4s] sm:-bottom-16 sm:h-56 sm:w-56" aria-hidden="true" />

      <PageContainer className="relative py-12 sm:py-16 md:py-20 lg:py-24">
        {/* ── Single centered column on mobile, two-col on desktop ── */}
        <div className="grid w-full min-w-0 max-w-full gap-8 md:grid-cols-[1.12fr_0.88fr] lg:grid-cols-[1.15fr_0.85fr] md:items-center lg:gap-14 xl:gap-16">

          {/* Left / main content — centered on mobile, left-aligned on md+ */}
          <div className="mx-auto flex w-full min-w-0 max-w-full sm:max-w-lg flex-col items-center text-center md:mx-0 md:max-w-none md:items-start md:text-start">

            {/* Live badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/90 px-3.5 py-1.5 text-xs font-medium text-ink shadow-2xs backdrop-blur-md transition-all hover:border-brand/40">
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="font-semibold text-ink">
                {inStock.length > 0
                  ? inStock.length === 1
                    ? t("1 product in stock")
                    : locale === "ru" && inStock.length % 10 >= 2 && inStock.length % 10 <= 4 && (inStock.length % 100 < 12 || inStock.length % 100 > 14)
                    ? t("{n} products in stock (few)", { n: inStock.length })
                    : t("{n} products in stock", { n: inStock.length })
                  : t("Digital products store")}
              </span>
              <span className="text-border" aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1 font-semibold text-brand">
                <svg className="h-3 w-3 text-brand" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                {t("Instant Delivery")}
              </span>
            </div>

            {/* Headline */}
            <h1 className="mt-4 text-[2.15rem] font-extrabold leading-[1.12] tracking-tight text-ink sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem] sm:leading-[1.1]">
              {t("Digital subscriptions,")}{" "}
              <span className="dv-gradient-text block sm:inline">{t("delivered instantly.")}</span>
            </h1>

            {/* Sub-copy */}
            <p className="mt-3.5 max-w-xl text-sm text-muted sm:text-base lg:text-lg leading-relaxed">
              {t("Fair prices, instant delivery, real support.")}{" "}
              <span className="font-medium text-ink/85 sm:whitespace-nowrap">{t("Pay with USDT or wallet balance.")}</span>
            </p>

            {/* Search bar */}
            <form
              className="dv-search group mt-6 flex w-full max-w-full min-w-0 items-center gap-2 rounded-2xl border border-border/90 bg-surface/95 p-1.5 shadow-card backdrop-blur-md transition-all duration-200 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(49,105,245,0.15),0_12px_28px_-8px_rgba(49,105,245,0.25)] sm:max-w-xl"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <div className="flex items-center ps-3.5 text-muted transition-colors group-focus-within:text-brand" aria-hidden="true">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search, e.g. Gemini, Muse AI…")}
                aria-label={t("Search products")}
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-ink placeholder:text-muted/70 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="p-1.5 text-muted hover:text-ink transition-colors rounded-lg"
                  aria-label={t("Clear search")}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <PrimaryButton type="submit" className="flex-shrink-0 px-4 sm:px-5 text-xs sm:text-sm font-semibold min-h-11">
                {t("Search")}
              </PrimaryButton>
            </form>

            {/* CTA buttons — stacked on mobile, row on sm+ */}
            <div className="mt-5 grid w-full max-w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 md:flex md:w-auto">
              <a href="#catalog" className="w-full sm:w-auto block">
                <PrimaryButton className="w-full sm:w-auto px-7 py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span>{t("Browse products")}</span>
                </PrimaryButton>
              </a>
              <a href="#how-it-works" className="w-full sm:w-auto block">
                <SecondaryButton className="w-full sm:w-auto px-7 py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{t("How it works")}</span>
                </SecondaryButton>
              </a>
            </div>

            {/* Feature trust pills */}
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 md:justify-start">
              {[
                {
                  icon: (
                    <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                    </svg>
                  ),
                  label: t("Instant delivery"),
                },
                {
                  icon: (
                    <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 012-2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  ),
                  label: t("Secure USDT"),
                },
                {
                  icon: (
                    <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-4 0h-2v2h2V9z" clipRule="evenodd" />
                    </svg>
                  ),
                  label: t("Real support"),
                },
              ].map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs backdrop-blur-sm transition-all hover:border-brand-light/60 hover:bg-surface"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft" aria-hidden="true">
                    {f.icon}
                  </span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — desktop float cards */}
          <div className="hidden md:block">
            <div className="mx-auto max-w-sm space-y-3.5">
              {/* Micro header label */}
              <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  {t("Live in-stock highlights")}
                </span>
                <span className="text-[11px] font-mono text-muted">{inStock.length} {t("available")}</span>
              </div>

              {inStock.slice(0, 3).map((p, i) => (
                <a
                  key={p.id}
                  href="#catalog"
                  className="dv-float group flex items-center gap-3.5 rounded-2xl border border-border/80 bg-surface/95 p-3.5 shadow-[0_4px_20px_-4px_rgba(23,33,58,0.06),0_0_0_1px_rgba(49,105,245,0.03)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_12px_28px_-6px_rgba(49,105,245,0.18)]"
                  style={{ marginInlineStart: `${i * 14}px`, animationDelay: `${i * 0.9}s` }}
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      loading="lazy"
                      decoding="async"
                      src={p.image_url}
                      alt=""
                      className="h-12 w-12 flex-shrink-0 rounded-xl border border-border/80 bg-bg p-0.5 object-cover shadow-2xs transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg font-bold text-brand shadow-2xs">
                      {(p.title || "?").trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-sm font-bold text-ink transition-colors group-hover:text-brand">
                      {p.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        {p.provider === "manual" && !p.auto_delivery ? t("Manual delivery") : t("Instant delivery")}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0" dir="ltr">
                    <span className="font-mono text-sm font-extrabold text-ink group-hover:text-brand transition-colors">
                      ${Number(p.sell_price).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted font-medium uppercase">USDT</span>
                  </div>
                </a>
              ))}

              {inStock.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-surface/70 p-6 text-center text-sm text-muted">
                  {t("New stock added regularly — check back soon.")}
                </div>
              )}

              {inStock.length > 3 && (
                <div className="pt-1 text-center">
                  <a
                    href="#catalog"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark transition-colors"
                  >
                    <span>{t("Browse all {n} products", { n: inStock.length })}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Mobile product ticker / auto-scrolling slider — below text, hidden on desktop */}
          {inStock.length > 0 && (() => {
            const baseItems = inStock.slice(0, 8);
            const tickerItems =
              baseItems.length < 4
                ? [...baseItems, ...baseItems, ...baseItems, ...baseItems]
                : [...baseItems, ...baseItems];

            return (
              <div className="w-full max-w-full min-w-0 overflow-hidden md:hidden pt-1">
                {/* Micro Header */}
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    <span className="text-ink font-bold">{t("In stock now")}</span>
                    <span className="rounded-full bg-success-soft text-success px-2 py-0.5 text-[10px] font-bold">
                      {inStock.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-brand">
                    {t("Tap to buy")} →
                  </span>
                </div>

                {/* Continuous Infinite Ticker Track with edge fade masks */}
                <div
                  className="relative w-full overflow-hidden py-1"
                  style={{
                    maskImage:
                      "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
                  }}
                >
                  <div className="animate-product-ticker gap-3">
                    {tickerItems.map((p, idx) => (
                      <Link
                        key={`${p.id}-${idx}`}
                        href={getProductUrl(p)}
                        className="group flex w-[172px] shrink-0 flex-col justify-between rounded-2xl border border-border/85 bg-surface/95 p-3.5 shadow-card backdrop-blur-md transition-all active:scale-[0.97] hover:border-brand/40 hover:shadow-md cursor-pointer"
                      >
                        {/* Avatar & Delivery badge row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              loading="lazy"
                              decoding="async"
                              src={p.image_url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-xl border border-border/80 bg-bg p-0.5 object-cover shadow-2xs group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-white text-base font-bold text-brand shadow-2xs ring-1 ring-border/80">
                              {(p.title || "?").trim().charAt(0).toUpperCase()}
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success border border-success/20">
                            <span>⚡</span>
                            <span>{p.provider === "manual" && !p.auto_delivery ? t("Manual") : t("Instant")}</span>
                          </span>
                        </div>

                        {/* Product Title */}
                        <span className="line-clamp-2 text-xs font-bold leading-snug text-ink group-hover:text-brand transition-colors min-h-[2.2rem]">
                          {p.title}
                        </span>

                        {/* Price & Action Button */}
                        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                          <div className="flex flex-col" dir="ltr">
                            <span className="font-mono text-xs font-extrabold text-ink group-hover:text-brand transition-colors">
                              ${Number(p.sell_price).toFixed(2)}
                            </span>
                            <span className="text-[9px] font-medium text-muted uppercase">USDT</span>
                          </div>

                          <span className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-[10px] font-bold text-brand group-hover:bg-brand group-hover:text-white transition-colors">
                            <span>{t("Buy")}</span>
                            <span aria-hidden="true">→</span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </PageContainer>
    </section>
  );
}

// ─── Admin Message Banner ──────────────────────────────────────────────────
// Shows a dismissable notification banner for each unread admin message.
// User can reply once; then the message disappears from the banner.
function AdminMessageBanner({ messages, onDismiss, onReply }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
      <PageContainer className="py-0">
        {messages.map((msg) => (
          <AdminMessageItem
            key={msg.id}
            msg={msg}
            onDismiss={onDismiss}
            onReply={onReply}
          />
        ))}
      </PageContainer>
    </div>
  );
}

function AdminMessageItem({ msg, onDismiss, onReply }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");

  async function dismiss() {
    await fetch("/api/messages/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msg.id }),
    }).catch(() => {});
    onDismiss(msg.id);
  }

  async function sendReply() {
    if (!replyText.trim()) return;
    setSending(true);
    setReplyError("");
    try {
      const res = await fetch("/api/messages/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: msg.id, reply: replyText.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setReplyError(data.error === "already_replied" ? t("You've already replied to this message.") : t("Failed to send reply. Please try again."));
        setSending(false);
        return;
      }
      onReply(msg.id);
    } catch {
      setReplyError(t("Failed to send reply. Please try again."));
      setSending(false);
    }
  }

  return (
    <div className="border-b border-amber-200 py-3 last:border-0 dark:border-amber-800">
      <div className="flex items-start gap-3">
        {/* Bell icon */}
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-200">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {msg.subject}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
              >
                {expanded ? t("Hide") : t("View")}
              </button>
              <button
                onClick={dismiss}
                className="text-xs text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
                aria-label={t("Dismiss")}
              >
                ✕
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-2 space-y-3">
              <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">
                {msg.body}
              </p>
              {!msg.reply_body && (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t("Type a reply… (optional)")}
                    maxLength={2000}
                    className="w-full rounded border border-amber-300 bg-white px-3 py-1.5 text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-700 dark:bg-surface"
                  />
                  {replyError && <p className="text-xs text-red-600 dark:text-red-400">{replyError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {sending ? t("Sending…") : t("Send reply")}
                    </button>
                    <button
                      onClick={dismiss}
                      className="rounded border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                    >
                      {t("Dismiss without reply")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
