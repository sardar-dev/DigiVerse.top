import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import PaymentPanel from "../components/PaymentPanel";
import RecentOrders from "../components/RecentOrders";
import SEO from "../components/SEO";
import { toProductCode, fromProductCode } from "../lib/productLink";
import { useToast } from "../components/ui/Toast";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import ProductCard from "../components/ui/ProductCard";
import Modal from "../components/ui/Modal";
import Alert from "../components/ui/Alert";
import { FormInput } from "../components/ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";
import { SITE_NAME, SITE_TAGLINE, SITE_URL, SITE_DESCRIPTION } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import * as fpixel from "../lib/fpixel";

function cleanSeoText(str) {
  if (!str) return "";
  return String(str)
    .replace(/\bbuff\s*tokens?\b/gi, "Muse AI Tokens")
    .replace(/\bbuff\b/gi, "Tokens")
    .replace(/\s+/g, " ")
    .trim();
}

// Server-rendered so search engines (and the first paint) see the
// actual product list immediately, not an empty page that fills in
// after a client-side fetch.
export async function getServerSideProps({ query, res }) {
  // Same list for every visitor, so let Vercel's edge serve it for 30s
  // (and refresh in the background) instead of querying the database on
  // every page view.
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
  const { data } = await fetchStorefrontProducts();
  const list = data || [];
  // Shared product links (?product=<id>) get a product-specific link
  // preview (title/blurb/image) in WhatsApp/Telegram etc. Taken from the
  // list we already fetched — no extra query.
  const shared = query?.product
    ? list.find((p) => String(p.id) === fromProductCode(query.product))
    : null;
  const sharedMeta = shared
    ? {
        id: String(shared.id),
        title: cleanSeoText(shared.title),
        description: cleanSeoText((shared.short_description || shared.description || "").slice(0, 250)),
        image: shared.image_url || null,
        price: Number(shared.sell_price),
        category: shared.category || "Software",
      }
    : null;

  return { props: { initialProducts: list, sharedMeta } };
}

export default function Storefront({ initialProducts, sharedMeta }) {
  const router = useRouter();
  const { t, locale } = useT();
  const { notify } = useToast();
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState(initialProducts || []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(null); // product being purchased
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(""); // "" = all
  const [sharedNotFound, setSharedNotFound] = useState(false);
  const [adminMessages, setAdminMessages] = useState([]);
  const [buyModalTicker, setBuyModalTicker] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    // Quiet background refresh — we already have server-rendered data
    // to show, this just keeps stock/price current without a loading
    // flash. Falls back to a visible error only if we truly have
    // nothing to show.
    loadProducts(products.length === 0);
    // Load buy modal ticker text (cached 60s — no DB hit per visitor)
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d.buy_modal_ticker) setBuyModalTicker(d.buy_modal_ticker); })
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

  // Shareable product links: /?product=<id> opens that product's buy
  // popup automatically, so a link someone pastes elsewhere lands
  // straight on the right item instead of a bare homepage. No new
  // route/page needed — same popup, just opened on load.
  // /?q=muse%20ai pre-fills the search box (used by blog links), so the
  // visitor lands on the catalog already filtered to that product.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.q;
    if (typeof q === "string" && q.trim()) setSearch(q.trim().slice(0, 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.q]);

  useEffect(() => {
    if (!router.isReady) return;
    const rawParam = router.query.product || router.query.buy;
    if (!rawParam || active) return;
    if (products.length === 0) return; // wait for the list to load first

    const match = products.find(
      (p) => String(p.id) === fromProductCode(rawParam) || String(p.id) === String(rawParam)
    );
    if (match && match.available_stock <= 0 && !match.tunvn_buff && String(match.id) !== "-12") {
      setSharedNotFound(true); // sold out: don't open a buy popup for it
    } else if (match) {
      setActive(match);
    } else {
      setSharedNotFound(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const productJsonLd = sharedMeta
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Product",
            name: sharedMeta.title,
            description:
              sharedMeta.description ||
              `Buy ${sharedMeta.title} with 0-second instant delivery on DigiVerse.`,
            image: sharedMeta.image ? [sharedMeta.image] : [`${SITE_URL}/og-preview.jpg`],
            category: sharedMeta.category || "Software",
            offers: {
              "@type": "Offer",
              url: `${SITE_URL}/?product=${toProductCode(sharedMeta.id)}`,
              priceCurrency: "USD",
              price: sharedMeta.price ? sharedMeta.price.toFixed(2) : "0.00",
              priceValidUntil: "2027-12-31",
              availability: "https://schema.org/InStock",
              itemCondition: "https://schema.org/NewCondition",
              seller: {
                "@type": "Organization",
                name: "DigiVerse",
                url: SITE_URL,
              },
            },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: t("Home"), item: SITE_URL },
              {
                "@type": "ListItem",
                position: 2,
                name: sharedMeta.title,
                item: `${SITE_URL}/?product=${toProductCode(sharedMeta.id)}`,
              },
            ],
          },
        ],
      }
    : null;

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
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      {sharedMeta ? (
        <SEO
          title={`Buy ${sharedMeta.title} | Instant Delivery`}
          description={`${sharedMeta.description ? sharedMeta.description + " — " : ""}${t("{price} on DigiVerse. Instant 0-second delivery and secure checkout.", { price: `$${sharedMeta.price.toFixed(2)}` })}`}
          path={`/?product=${toProductCode(sharedMeta.id)}`}
          image={sharedMeta.image || undefined}
          keywords={`${sharedMeta.title}, buy ${sharedMeta.title}, instant software license, digital goods, DigiVerse`}
          jsonLd={productJsonLd}
        />
      ) : (
        <SEO
          title="Buy Digital Software Licenses & Muse AI Tokens"
          description="Instant digital goods marketplace. Buy Muse AI tokens, premium software license keys, and accounts with 0-second delivery. 100% warranty, pay securely with USDT & crypto."
          keywords="digital software licenses, Muse AI tokens, buy Muse AI tokens, cheap license keys, Windows keys, office licenses, crypto software store, USDT digital goods, instant digital delivery, DigiVerse"
          jsonLd={storeJsonLd}
        />
      )}
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
        <section id="how-it-works" className="border-b border-border bg-surface">
          <PageContainer className="py-10">
            <h2 className="text-center text-xl font-semibold text-ink sm:text-2xl">
              {t("How it works")}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
              {t("From choosing a product to receiving it, in three simple steps.")}
            </p>
            <ol className="mt-8 grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-3">
              {[
                { n: 1, title: t("Choose a product"), text: t("Browse the catalog and pick what you need. Prices are shown upfront.") },
                { n: 2, title: t("Pay with USDT or wallet"), text: t("Send the exact USDT (BEP20) amount, or pay instantly from your wallet balance.") },
                { n: 3, title: t("Receive instantly"), text: t("Your order details appear right away and stay saved under My Orders.") },
              ].map((step) => (
                <li
                  key={step.n}
                  className="rounded-xl border border-border bg-bg p-5 text-center shadow-card transition-shadow hover:shadow-[0_18px_36px_-18px_rgba(49,105,245,0.45)]"
                >
                  <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-light to-brand-dark text-sm font-semibold text-white shadow-[0_0_22px_rgba(49,105,245,0.55)]">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </PageContainer>
        </section>

        {/* Catalog */}
        <section id="catalog">
          <PageContainer className="py-10">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink sm:text-2xl">{t("Products")}</h2>
                <p className="text-sm text-muted">
                  {products.length > 0
                    ? t("{shown} of {total} shown · {stock} in stock", { shown: visible.length, total: products.length, stock: inStock.length })
                    : t("Browse what's available")}
                </p>
              </div>
              <div className="dv-search flex w-full max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 shadow-card transition-shadow sm:w-auto sm:max-w-sm sm:min-w-[280px]">
                <span className="text-muted" aria-hidden="true">🔍</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Search products…")}
                  aria-label={t("Search products")}
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label={t("Clear search")} className="text-muted hover:text-ink">
                    ✕
                  </button>
                )}
              </div>
            </div>

            {categories.length > 1 && (
              <div className="mb-6 flex w-full max-w-full min-w-0 flex-wrap gap-2" role="group" aria-label={t("Filter by category")}>
                {["", ...categories].map((c) => (
                  <button
                    key={c || "all"}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                      category === c
                        ? "bg-brand text-white shadow-[0_8px_20px_-6px_rgba(49,105,245,0.75)]"
                        : "bg-brand-soft text-brand hover:bg-brand/10 hover:shadow-[0_0_16px_-4px_rgba(49,105,245,0.4)]"
                    }`}
                  >
                    {c || t("All")}
                  </button>
                ))}
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
                  onBuy={() => setActive(p)}
                  onShare={() => shareProduct(p, notify, t, locale)}
                />
              ))}
            </div>
          </PageContainer>
        </section>

        <RecentOrders />
      </main>

      <SiteFooter />

      {active && (
        <BuyModal
          product={active}
          session={session}
          ticker={buyModalTicker}
          onClose={() => {
            setActive(null);
            // Drop ?product= so closing the popup doesn't reopen it
            // on the next render / back navigation.
            if (router.query.product) {
              const { product: _drop, ...rest } = router.query;
              router.replace({ pathname: "/", query: rest }, undefined, { shallow: true });
            }
          }}
        />
      )}
    </div>
  );
}

function shareProduct(product, notify, t, locale) {
  const prefix = locale && locale !== "en" ? `/${locale}` : "";
  const url = `${window.location.origin}${prefix}/?product=${toProductCode(product.id)}`;
  if (navigator.share) {
    navigator.share({ title: product.title, url }).catch(() => {});
    return;
  }
  navigator.clipboard
    ?.writeText(url)
    .then(() => notify?.(t("Product link copied! 🔗")))
    .catch(() => window.prompt(t("Copy this link:"), url));
}

function BuyModal({ product, onClose, ticker, session }) {
  const { t } = useT();
  const [step, setStep] = useState("form"); // form | summary | order | done
  const [quantity, setQuantity] = useState("1"); // string so input can be cleared while typing
  const [email, setEmail] = useState("");
  const [activationInfo, setActivationInfo] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null);
  const [manual, setManual] = useState(false);
  const [creating, setCreating] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(null); // { code, discount, final } once applied
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [availableGiftsData, setAvailableGiftsData] = useState(null);
  const [giftsToRedeem, setGiftsToRedeem] = useState(0);
  const [buffState, setBuffState] = useState(null);

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
        if (data.state === "done") {
          setBuffState("done");
          stop = true;
        } else if (data.state === "failed") {
          setBuffState("failed");
          stop = true;
        }
      } catch {}
    }
    const tId = setTimeout(check, 3000);
    const interval = setInterval(() => {
      if (!stop) check();
    }, 6000);
    return () => {
      stop = true;
      clearTimeout(tId);
      clearInterval(interval);
    };
  }, [step, product?.tunvn_buff, order?.id]);

  useEffect(() => {
    if ((product?.tunvn_buff || String(product?.id) === "-12") && product?.id) {
      fetch(`/api/wallet/gifts/available?product_id=${product.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.eligible && d.max_redeemable > 0) {
            setAvailableGiftsData(d);
            setGiftsToRedeem(1);
          }
        })
        .catch(() => {});
    }
  }, [product?.id, product?.tunvn_buff]);

  useEffect(() => {
    if (product?.id) {
      fpixel.event("ViewContent", {
        content_name: product.title,
        content_ids: [String(product.id)],
        content_type: "product",
        value: Number(product.sell_price) || 0,
        currency: "USD",
      });
    }
  }, [product?.id, product?.title, product?.sell_price]);

  const isManualDelivery =
    product.delivery_badge === "manual"
      ? true
      : product.delivery_badge === "auto"
      ? false
      : product.provider === "manual" && !product.auto_delivery;

  // activation_field is now a free-text label set by the admin
  // (e.g. "Game ID", "Discord Username"). Legacy values "email"/"username"
  // are kept working via friendly display names.
  const activationLabel = product.activation_field
    ? product.activation_field === "email"
      ? t("Your email (for activation)")
      : product.activation_field === "username"
      ? t("Your username (for activation)")
      : product.activation_field
    : null;
  const activationShort = product.activation_field
    ? product.activation_field === "email"
      ? t("Your email")
      : product.activation_field === "username"
      ? t("Your username")
      : product.activation_field
    : null;
  const activationPlaceholder = product.activation_placeholder || activationLabel || "";

  function reviewOrder() {
    setError("");
    const parsedQty = parseInt(quantity, 10);
    // Validate quantity first — applies to all products
    if (!quantity || isNaN(parsedQty) || parsedQty < 1) {
      setError(t("Please enter a quantity of at least 1."));
      return;
    }
    if (product.requires_email && product.provider !== "manual" && !email) {
      setError(describeError(t, "email_required"));
      return;
    }
    if (product.provider === "manual") {
      const minQty = product.min_order_qty ?? 1;
      const maxQty = product.max_order_qty ?? null;
      if (parsedQty < minQty) {
        setError(describeError(t, "qty_below_minimum", undefined, undefined, undefined, minQty));
        return;
      }
      if (maxQty !== null && parsedQty > maxQty) {
        setError(describeError(t, "qty_exceeds_maximum", undefined, undefined, maxQty));
        return;
      }
      if (product.activation_field && !activationInfo.trim()) {
        setError(describeError(t, "activation_info_required"));
        return;
      }
      if (product.tunvn_buff) {
        let code = activationInfo.trim();
        if (code.includes("http://") || code.includes("https://") || code.includes("/")) {
          try {
            const u = new URL(code.startsWith("http") ? code : `https://${code}`);
            const parts = u.pathname.split("/").filter(Boolean);
            const codeFromPath = parts[parts.length - 1];
            const codeFromParam = u.searchParams.get("invite") || u.searchParams.get("ref") || u.searchParams.get("code");
            code = (codeFromParam || codeFromPath || code).trim();
          } catch {
            const m = code.match(/([A-Za-z0-9_-]{4,32})\s*$/);
            if (m) code = m[1];
          }
          setActivationInfo(code);
        }
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) {
          setError(t("Please enter a valid Muse AI invite code (4–32 characters)."));
          return;
        }
      }
    }
    setStep("summary");
  }

  async function applyCoupon() {
    setCouponError("");
    if (!couponInput.trim()) return;
    setCouponBusy(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput, product_id: product.id, quantity: parseInt(quantity, 10) || 1 }),
      });
      const data = await res.json();
      if (data.success) {
        setCoupon(data);
      } else {
        setCoupon(null);
        setCouponError(describeError(t, data.error, undefined, data.min_order));
      }
    } catch {
      setCouponError(t("Couldn't check that code — try again."));
    }
    setCouponBusy(false);
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponError("");
  }

  async function confirmOrder() {
    setError("");
    setCreating(true);
    const res = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.id,
        quantity: Math.max(parseInt(quantity, 10) || 1, effectiveGifts),
        email,
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
  }

  const parsedQty = parseInt(quantity, 10) || 0;
  const unitPriceNum = Number(product.sell_price) || 0;
  const maxAvailableGifts = availableGiftsData?.max_redeemable || 0;
  const effectiveGifts = Math.min(giftsToRedeem, maxAvailableGifts);
  const currentTotalQty = Math.max(parsedQty, effectiveGifts);
  const giftDiscountAmount = effectiveGifts * unitPriceNum;
  const paidQty = Math.max(0, currentTotalQty - effectiveGifts);
  const subtotal = Number((paidQty * unitPriceNum).toFixed(2));
  const total = (coupon ? coupon.final : subtotal).toFixed(2);
  const checkParts = t("Check {link} once it's ready. If you need support, just quote your order number above.").split("{link}");
  const stepLabels = { form: t("1. Details"), summary: t("2. Review"), order: t("3. Payment"), done: t("4. Done") };

  return (
    <Modal title={product.title} onClose={onClose}>
      {/* Scrolling ticker — shown when admin has set text */}
      {ticker && (
        <div className="mb-3 overflow-hidden rounded-lg bg-brand">
          <div
            className="flex whitespace-nowrap py-1.5 text-xs font-semibold text-white"
            style={{ animation: "marquee 18s linear infinite" }}
          >
            <span className="inline-block px-4">📢 {ticker}</span>
            <span className="inline-block px-4" aria-hidden="true">📢 {ticker}</span>
            <span className="inline-block px-4" aria-hidden="true">📢 {ticker}</span>
          </div>
        </div>
      )}

      {step !== "done" && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {stepLabels[step]}
          </p>
          {(step === "summary" || step === "order") && (
            <button
              type="button"
              onClick={() => setStep("form")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition-all hover:bg-brand-soft hover:border-brand/30 hover:text-brand active:scale-95 cursor-pointer"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>{t("Change quantity")}</span>
            </button>
          )}
        </div>
      )}

      {product.description && step === "form" && (
        <p className="mb-4 max-h-56 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted">
          {product.description}
        </p>
      )}

      {product.warranty && step === "form" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-success/20 bg-success-soft px-3.5 py-2.5 text-sm text-success">
          <span aria-hidden="true">🛡️</span>
          <span>
            <strong>{t("Warranty:")}</strong> {product.warranty}
          </span>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          {(product.tunvn_buff || String(product.id) === "-12") && availableGiftsData?.max_redeemable > 0 && (
            <div className="rounded-xl border border-success/40 bg-success-soft/30 px-3.5 py-2.5 text-xs text-success flex items-center justify-between font-medium">
              <span>🎁 {t("1 Free Gift Box auto-applied ({n} available)", { n: availableGiftsData.max_redeemable })}</span>
              <span className="font-bold font-mono">$0.00 Total</span>
            </div>
          )}
          {isManualDelivery && (
            <Alert variant="warning">
              {t("This product is delivered manually. Estimated delivery: {delivery}. You'll find it in My Orders once it's ready.", {
                delivery: product.delivery || t("see details"),
              })}
            </Alert>
          )}
          <FormInput
            label={t("Quantity")}
            type="number"
            min={product.provider === "manual" && product.min_order_qty ? product.min_order_qty : 1}
            max={product.provider === "manual" && product.max_order_qty ? product.max_order_qty : product.available_stock}
            value={quantity}
            onChange={(e) => {
              // Keep raw string so user can clear the box and retype freely
              const raw = e.target.value;
              setQuantity(raw === "" ? "" : raw.replace(/^0+(\d)/, "$1"));
              setCoupon(null);
            }}
            onBlur={() => {
              // On blur: if empty or invalid, reset to minimum (1 or min_order_qty)
              const parsed = parseInt(quantity, 10);
              const minQty = (product.provider === "manual" && product.min_order_qty) ? product.min_order_qty : 1;
              if (!quantity || isNaN(parsed) || parsed < 1) {
                setQuantity(String(minQty));
              }
            }}
            hint={
              product.provider === "manual" && product.max_order_qty
                ? `${t("Max {n} per order", { n: product.max_order_qty })}${product.min_order_qty > 1 ? ` · ${t("Min {n}", { n: product.min_order_qty })}` : ""}`
                : product.provider === "manual" && product.min_order_qty > 1
                ? t("Min {n} per order", { n: product.min_order_qty })
                : undefined
            }
          />
          {product.requires_email && product.provider !== "manual" && (
            <FormInput
              label={t("Email for delivery")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              data-lpignore="true"
              data-form-type="other"
            />
          )}
          {!session && !(product.requires_email && product.provider !== "manual") && (
            <FormInput
              label={t("Email address (optional, for receipt & order tracking)")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              data-lpignore="true"
              data-form-type="other"
            />
          )}
          {activationLabel && (
            <FormInput
              label={activationLabel}
              type="text"
              value={activationInfo}
              onChange={(e) => setActivationInfo(e.target.value)}
              placeholder={activationPlaceholder}
              hint={t("We'll use this to activate your subscription after payment.")}
            />
          )}
          <Alert variant="error">{error}</Alert>
          <PrimaryButton onClick={reviewOrder} className="w-full">
            {t("Review order")}
          </PrimaryButton>
        </div>
      )}

      {step === "summary" && (
        <div className="space-y-4 text-sm">
          <div className="divide-y divide-border rounded-lg border border-border">
            <Row label={t("Product")} value={product.title} />
            <Row label={t("Quantity")} value={currentTotalQty} mono />
            <Row label={t("Unit price")} value={`$${Number(product.sell_price).toFixed(2)}`} mono />
            {email && <Row label={t("Contact / Delivery email")} value={email} />}
            {activationLabel && (
              <Row label={activationShort} value={activationInfo} />
            )}
            {isManualDelivery && (
              <Row label={t("Delivery")} value={t("Manual — {delivery}", { delivery: product.delivery || t("see details") })} />
            )}
            {effectiveGifts > 0 && (
              <div className="flex justify-between px-3.5 py-3 text-brand font-medium">
                <span>🎁 {t("Referral Gift ({n}B free)", { n: effectiveGifts })}</span>
                <span className="font-mono" dir="ltr">−${giftDiscountAmount.toFixed(2)}</span>
              </div>
            )}
            {coupon && (
              <>
                <Row label={t("Subtotal")} value={`$${subtotal.toFixed(2)}`} mono />
                <div className="flex justify-between px-3.5 py-3 text-success">
                  <span>
                    {t("Coupon")} {coupon.code}
                    {coupon.discount_type !== "percent" && quantity > 1 ? ` ${t("(per item × {n})", { n: quantity })}` : ""}
                  </span>
                  <span className="font-mono" dir="ltr">−${Number(coupon.discount).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between px-3.5 py-3 text-base font-semibold text-ink">
              <span>{t("Total")}</span>
              <span dir="ltr">${total}</span>
            </div>
          </div>

          {/* Referral Gift Box Redemption Selector for Muse AI */}
          {(product.tunvn_buff || String(product.id) === "-12") && availableGiftsData?.max_redeemable > 0 && (
            <div className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand-soft/40 to-surface p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎁</span>
                  <div>
                    <span className="font-semibold text-xs text-ink">{t("Redeem Muse AI Gift Boxes")}</span>
                    <p className="text-[11px] text-muted">
                      {t("1 Box = 1B Free Tokens ({n} available today)", { n: availableGiftsData.max_redeemable })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={effectiveGifts <= 0}
                    onClick={() => setGiftsToRedeem((g) => Math.max(0, g - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-sm font-bold text-ink hover:bg-border/40 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="min-w-[24px] text-center font-mono font-bold text-sm text-brand">
                    {effectiveGifts}
                  </span>
                  <button
                    type="button"
                    disabled={effectiveGifts >= maxAvailableGifts}
                    onClick={() => {
                      setGiftsToRedeem((g) => {
                        const next = Math.min(maxAvailableGifts, g + 1);
                        if (next > parsedQty) {
                          setQuantity(String(next));
                        }
                        return next;
                      });
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-sm font-bold text-ink hover:bg-border/40 disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
              {effectiveGifts > 0 && (
                <div className="flex items-center justify-between text-xs text-brand font-medium pt-1.5 border-t border-brand/20">
                  <span>{t("Free Tokens: {n}B", { n: effectiveGifts })}</span>
                  <span className="font-mono" dir="ltr">−${giftDiscountAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            {coupon ? (
              <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-soft px-3.5 py-2.5 text-success">
                <span>🎟️ {t("{code} applied", { code: coupon.code })}</span>
                <button type="button" onClick={removeCoupon} className="text-xs font-medium underline">
                  {t("Remove")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <FormInput
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder={t("Coupon code")}
                  aria-label={t("Coupon code")}
                  className="font-mono"
                  autoComplete="off"
                />
                <SecondaryButton onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
                  {couponBusy ? "…" : t("Apply")}
                </SecondaryButton>
              </div>
            )}
            <Alert variant="error">{couponError}</Alert>
          </div>
          <Alert variant="error">{error}</Alert>
          <div className="flex gap-3">
            <SecondaryButton onClick={() => setStep("form")} className="flex-1">
              {t("Back")}
            </SecondaryButton>
            <PrimaryButton onClick={confirmOrder} disabled={creating} className="flex-1">
              {creating ? t("Creating…") : t("Confirm & continue")}
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === "order" && order && (
        <PaymentPanel
          order={order}
          product={product}
          onBack={() => setStep("form")}
          onDone={(result) => {
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

      {step === "done" && manual && (
        <div className="space-y-3 text-sm">
          <p className="font-mono text-xs text-muted" dir="ltr">{t("Order #{n}", { n: order?.order_number })}</p>
          {product.tunvn_buff && buffState === "done" ? (
            <Alert variant="success">
              🎉 <strong>{t("Tokens delivered successfully!")}</strong> {t("The Muse AI tokens have been credited to your account.")}
            </Alert>
          ) : (
            <Alert variant="success">
              {product.tunvn_buff ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-success border-t-transparent" />
                    <span>{t("Payment confirmed! Crediting tokens to your invite code… (usually 1–2 minutes)")}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {t("We are auto-checking with supplier. You can wait here or check {link} anytime.", {
                      link: "",
                    })}{" "}
                    <Link href="/account/orders" className="underline font-medium text-success">
                      {t("My Orders")}
                    </Link>
                  </p>
                </div>
              ) : (
                <>
                  {t("Payment confirmed. This product is delivered manually — estimated delivery {delivery}.", { delivery: product.delivery || t("soon") })}{" "}
                  {checkParts[0]}
                  <Link href="/account/orders" className="underline">
                    {t("My Orders")}
                  </Link>
                  {checkParts[1]}
                </>
              )}
            </Alert>
          )}
          <PrimaryButton onClick={onClose} className="w-full">
            {t("Done")}
          </PrimaryButton>
        </div>
      )}

      {step === "done" && !manual && (
        <div className="space-y-3 text-sm">
          <p className="font-mono text-xs text-muted" dir="ltr">{t("Order #{n}", { n: order?.order_number })}</p>
          <p className="text-ink">{t("Delivered. Save these now:")}</p>
          <pre dir="ltr" className="whitespace-pre-wrap break-all rounded-lg border border-border bg-brand-soft p-3 font-mono text-xs text-ink">
            {(items || []).join("\n\n")}
          </pre>
          <PrimaryButton onClick={onClose} className="w-full">
            {t("Done")}
          </PrimaryButton>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3 px-3.5 py-3">
      <span className="text-muted">{label}</span>
      <span className={`text-end break-all text-ink ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function describeError(t, code, available, minOrder, maxQty, minQty) {
  switch (code) {
    case "qty_below_minimum":
      return t("Minimum order quantity is {n}. Please increase the quantity.", { n: minQty });
    case "qty_exceeds_maximum":
      return t("Maximum order quantity is {n}. Please lower the quantity.", { n: maxQty });
    case "not_enough_stock":
      return Number(available) > 0
        ? t("Only {n} left — lower the quantity and try again.", { n: available })
        : t("Sorry, this product just sold out. Please check back soon.");
    case "supplier_unavailable":
      return t("This product is temporarily unavailable. Please try again later.");
    case "email_required":
      return t("This product needs an email address for delivery.");
    case "activation_info_required":
      return t("Please enter the info needed to activate your subscription.");
    case "invalid_coupon":
      return t("That coupon code isn't valid.");
    case "coupon_inactive":
      return t("That coupon is no longer active.");
    case "coupon_expired":
      return t("That coupon has expired.");
    case "coupon_wrong_product":
      return t("That coupon doesn't apply to this product.");
    case "coupon_min_order":
      return t("This coupon needs an order of at least {amount}.", { amount: `$${Number(minOrder || 0).toFixed(2)}` });
    case "coupon_used_up":
      return t("That coupon has reached its usage limit.");
    case "coupon_unavailable":
      return t("This coupon is temporarily disabled. Please try again later or contact support.");
    case "coupon_already_used":
      return t("You've already used this coupon.");
    case "supplier_balance_limit":
      return Number(maxQty) > 0
        ? t("You can order up to {n}B tokens right now. Please lower the quantity.", { n: maxQty })
        : t("This product is temporarily unavailable. Please try again later.");
    case "buff_check_failed":
      return t("Invalid invite code or service is currently unavailable. Please verify your invite code.");
    case "invalid_invite_code":
      return t("Please enter a valid Muse AI invite code (4–20 alphanumeric characters).");
    case "stock_check_failed":
      return t("Unable to verify supplier stock right now. Please try again in a few moments.");
    default:
      return code ? code.replaceAll("_", " ") : "";
  }
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

      <PageContainer className="relative py-10 sm:py-14 md:py-18">
        {/* ── Single centered column on mobile, two-col on desktop ── */}
        <div className="grid w-full min-w-0 max-w-full gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center md:gap-12">

          {/* Left / main content — centered on mobile */}
          <div className="mx-auto flex w-full min-w-0 max-w-full sm:max-w-lg flex-col items-center text-center md:mx-0 md:max-w-none md:items-start md:text-start">

            {/* Live badge */}
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-surface/90 px-3 py-1.5 text-xs font-medium text-brand shadow-[0_0_22px_-4px_rgba(49,105,245,0.45)] backdrop-blur">
              <span className="dv-live-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              {inStock.length > 0
                ? inStock.length === 1
                  ? t("1 product in stock")
                  : locale === "ru" && inStock.length % 10 >= 2 && inStock.length % 10 <= 4 && (inStock.length % 100 < 12 || inStock.length % 100 > 14)
                  ? t("{n} products in stock (few)", { n: inStock.length })
                  : t("{n} products in stock", { n: inStock.length })
                : t("Digital products store")}
            </span>

            {/* Headline */}
            <h1 className="mt-4 text-[2rem] font-bold leading-tight tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {t("Digital subscriptions,")}{" "}
              <span className="dv-gradient-text">{t("delivered instantly.")}</span>
            </h1>

            {/* Sub-copy */}
            <p className="mt-3 text-sm text-muted sm:text-base">
              {t("Fair prices, instant delivery, real support.")}{" "}
              <span className="sm:whitespace-nowrap">{t("Pay with USDT or wallet balance.")}</span>
            </p>

            {/* Search bar */}
            <form
              className="dv-search mt-5 flex w-full max-w-full min-w-0 gap-2 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-card backdrop-blur transition-shadow"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span className="flex items-center ps-3 text-muted" aria-hidden="true">🔍</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search, e.g. Gemini, Muse AI…")}
                aria-label={t("Search products")}
                className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-muted focus:outline-none"
              />
              <PrimaryButton type="submit" className="flex-shrink-0 px-3 sm:px-4 text-xs sm:text-sm">{t("Search")}</PrimaryButton>
            </form>

            {/* CTA buttons — stacked on mobile, row on sm+ */}
            <div className="mt-4 grid w-full max-w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 md:flex md:w-auto">
              <a href="#catalog" className="w-full block">
                <PrimaryButton className="w-full px-7 py-2.5">{t("Browse products")}</PrimaryButton>
              </a>
              <a href="#how-it-works" className="w-full block">
                <SecondaryButton className="w-full px-7 py-2.5">{t("How it works")}</SecondaryButton>
              </a>
            </div>

            {/* Feature pills */}
            <ul className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {[
                { icon: "⚡", label: t("Instant delivery") },
                { icon: "🔒", label: t("Secure USDT") },
                { icon: "💬", label: t("Real support") },
              ].map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur"
                >
                  <span aria-hidden="true">{f.icon}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — desktop float cards */}
          <div className="hidden md:block">
            <div className="mx-auto max-w-xs space-y-3 lg:max-w-sm">
              {inStock.slice(0, 3).map((p, i) => (
                <a
                  key={p.id}
                  href="#catalog"
                  className="dv-float flex items-center gap-3 rounded-xl border border-brand/15 bg-surface/95 p-3.5 shadow-[0_0_0_1px_rgba(49,105,245,0.05),0_18px_36px_-14px_rgba(49,105,245,0.45)] backdrop-blur transition-shadow hover:shadow-[0_0_0_1px_rgba(49,105,245,0.35),0_22px_44px_-12px_rgba(49,105,245,0.6)]"
                  style={{ marginInlineStart: `${i * 14}px`, animationDelay: `${i * 0.9}s` }}
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={p.image_url} alt=""
                      className="h-11 w-11 flex-shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-lg font-bold text-brand">
                      {(p.title || "?").trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.title}</span>
                    <span className="block text-xs text-success">
                      {p.provider === "manual" && !p.auto_delivery ? t("Manual delivery") : t("Instant delivery")}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-ink" dir="ltr">${Number(p.sell_price).toFixed(2)}</span>
                </a>
              ))}
              {inStock.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-surface/70 p-6 text-center text-sm text-muted">
                  {t("New stock added regularly — check back soon.")}
                </div>
              )}
            </div>
          </div>

          {/* Mobile product strip — below text, hidden on desktop */}
          {inStock.length > 0 && (
            <div className="w-full max-w-full min-w-0 overflow-hidden md:hidden">
              <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-muted">{t("In stock now")}</p>
              <div className="flex w-full max-w-full min-w-0 gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {inStock.slice(0, 6).map((p) => (
                  <a
                    key={p.id}
                    href="#catalog"
                    className="flex w-28 flex-shrink-0 flex-col items-center gap-2 rounded-xl border border-brand/15 bg-surface/95 p-3 text-center shadow-card backdrop-blur"
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={p.image_url} alt=""
                        className="h-10 w-10 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-lg font-bold text-brand">
                        {(p.title || "?").trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="line-clamp-2 text-xs font-semibold leading-tight text-ink">{p.title}</span>
                    <span className="text-xs font-bold text-brand" dir="ltr">${Number(p.sell_price).toFixed(2)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

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
