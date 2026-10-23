import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import PaymentPanel from "../components/PaymentPanel";
import RecentOrders from "../components/RecentOrders";
import SEO from "../components/SEO";
import { toProductCode, fromProductCode } from "../lib/productLink";
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

// Server-rendered so search engines (and the first paint) see the
// actual product list immediately, not an empty page that fills in
// after a client-side fetch.
export async function getServerSideProps({ query }) {
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
        title: shared.title,
        description: (shared.short_description || shared.description || "").slice(0, 200),
        image: shared.image_url || null,
        price: Number(shared.sell_price),
      }
    : null;

  return { props: { initialProducts: list, sharedMeta } };
}

export default function Storefront({ initialProducts, sharedMeta }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState(initialProducts || []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(null); // product being purchased
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(""); // "" = all
  const [sharedNotFound, setSharedNotFound] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    // Quiet background refresh — we already have server-rendered data
    // to show, this just keeps stock/price current without a loading
    // flash. Falls back to a visible error only if we truly have
    // nothing to show.
    loadProducts(products.length === 0);
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const productId = router.query.product;
    if (!productId || active) return;
    if (products.length === 0) return; // wait for the list to load first

    const match = products.find((p) => String(p.id) === fromProductCode(productId));
    if (match && match.available_stock <= 0) {
      setSharedNotFound(true); // sold out: don't open a buy popup for it
    } else if (match) {
      if (session) setActive(match);
    } else {
      setSharedNotFound(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.product, products, session]);

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

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      {sharedMeta ? (
        <SEO
          title={sharedMeta.title}
          description={`${sharedMeta.description ? sharedMeta.description + " — " : ""}$${sharedMeta.price.toFixed(2)} on DigiVerse. Instant delivery and secure checkout.`}
          path={`/?product=${toProductCode(sharedMeta.id)}`}
          image={sharedMeta.image || undefined}
        />
      ) : (
        <SEO />
      )}
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                { "@type": "Organization", name: "DigiVerse", url: SITE_URL, description: SITE_DESCRIPTION },
                { "@type": "WebSite", name: "DigiVerse", url: SITE_URL },
              ],
            }),
          }}
        />
      </Head>
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-soft via-surface to-surface">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl"
            aria-hidden="true"
          />
          <PageContainer className="relative grid gap-10 py-12 sm:py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface px-3 py-1 text-xs font-medium text-brand shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                {inStock.length > 0
                  ? `${inStock.length} product${inStock.length === 1 ? "" : "s"} in stock now`
                  : "Digital products store"}
              </span>
              <h1 className="mt-4 text-3xl font-bold leading-tight text-ink sm:text-5xl">
                Digital subscriptions &amp; licenses,{" "}
                <span className="text-brand">delivered instantly.</span>
              </h1>
              <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
                An independent store for digital subscriptions, licenses and activation codes at fair
                prices. Pay with USDT (BEP20) or your wallet balance and receive your order details
                right after payment confirms.
              </p>
              <form
                className="mt-6 flex max-w-lg gap-2"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a product, e.g. Gemini, Muse AI…"
                  aria-label="Search products"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 text-sm text-ink shadow-sm placeholder:text-muted focus:border-brand focus:outline-none"
                />
                <PrimaryButton type="submit" className="px-5">
                  Search
                </PrimaryButton>
              </form>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href="#catalog">
                  <PrimaryButton className="px-6">Browse products</PrimaryButton>
                </a>
                <a href="#how-it-works">
                  <SecondaryButton className="px-6">How it works</SecondaryButton>
                </a>
              </div>
              <ul className="mt-8 grid max-w-lg grid-cols-1 gap-3 text-sm text-ink sm:grid-cols-3">
                {[
                  { icon: "⚡", title: "Instant delivery", text: "Automatic items arrive right after payment" },
                  { icon: "🔒", title: "Secure USDT payment", text: "On-chain BEP20, verified automatically" },
                  { icon: "💬", title: "Real support", text: "Questions? We are here to help" },
                ].map((f) => (
                  <li key={f.title} className="flex items-start gap-2.5">
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-base"
                      aria-hidden="true"
                    >
                      {f.icon}
                    </span>
                    <span>
                      <span className="block font-semibold">{f.title}</span>
                      <span className="block text-xs text-muted">{f.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Live preview of real in-stock products */}
            <div className="hidden md:block">
              <div className="mx-auto max-w-sm space-y-3 [transform:perspective(1000px)_rotateY(-6deg)_rotateX(2deg)]">
                {inStock.slice(0, 3).map((p, i) => (
                  <a
                    key={p.id}
                    href="#catalog"
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-[0_12px_24px_-10px_rgba(23,33,58,0.25)] transition-transform hover:-translate-y-0.5"
                    style={{ marginLeft: `${i * 14}px` }}
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async"
                        src={p.image_url}
                        alt=""
                        className="h-11 w-11 flex-shrink-0 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-base font-semibold text-brand">
                        {(p.title || "?").trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{p.title}</span>
                      <span className="block text-xs text-success">
                        {p.provider === "manual" && !p.auto_delivery
                          ? "Manual delivery"
                          : "Instant delivery"}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      ${Number(p.sell_price).toFixed(2)}
                    </span>
                  </a>
                ))}
                {inStock.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-surface/70 p-6 text-center text-sm text-muted">
                    New stock is added regularly — check back soon.
                  </div>
                )}
              </div>
            </div>
          </PageContainer>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-b border-border bg-surface">
          <PageContainer className="py-10">
            <h2 className="text-center text-xl font-semibold text-ink sm:text-2xl">
              How it works
            </h2>
            <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
              From choosing a product to receiving it, in three simple steps.
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { n: 1, title: "Choose a product", text: "Browse the catalog and pick what you need. Prices are shown upfront." },
                { n: 2, title: "Pay with USDT or wallet", text: "Send the exact USDT (BEP20) amount, or pay instantly from your wallet balance." },
                { n: 3, title: "Receive instantly", text: "Your order details appear right away and stay saved under My Orders." },
              ].map((step) => (
                <li
                  key={step.n}
                  className="rounded-xl border border-border bg-bg p-5 text-center shadow-card"
                >
                  <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
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
            <div className="mb-4 max-w-sm">
              <FormInput
                label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products"
              />
            </div>

            {categories.length > 1 && (
              <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                <button
                  onClick={() => setCategory("")}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    category === "" ? "bg-brand text-white" : "bg-brand-soft text-brand hover:bg-brand/10"
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      category === c ? "bg-brand text-white" : "bg-brand-soft text-brand hover:bg-brand/10"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {loading && products.length === 0 && <LoadingState label="Loading stock…" />}

            {loadError && (
              <ErrorState
                title="Couldn't load products"
                description="Something's wrong on our end — please try again."
                onRetry={() => loadProducts(true)}
              />
            )}

            {!loading && !loadError && products.length === 0 && (
              <EmptyState
                title="Nothing in stock right now"
                description="Check back soon — new stock is added regularly."
              />
            )}

            {!loading && !loadError && products.length > 0 && visible.length === 0 && (
              <EmptyState
                title={search ? `No products match "${search}"` : "No products in this category"}
              />
            )}

            {sharedNotFound && (
              <Alert variant="warning" className="mb-4">
                That shared product link isn't available anymore — it may be out of stock or
                removed.
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onBuy={() => (session ? setActive(p) : (window.location.href = "/login"))}
                  onShare={() => shareProduct(p)}
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

function shareProduct(product) {
  const url = `${window.location.origin}/?product=${toProductCode(product.id)}`;
  if (navigator.share) {
    navigator.share({ title: product.title, url }).catch(() => {});
    return;
  }
  navigator.clipboard
    ?.writeText(url)
    .then(() => window.alert("Product link copied to clipboard"))
    .catch(() => window.prompt("Copy this link:", url));
}

function BuyModal({ product, onClose }) {
  const [step, setStep] = useState("form"); // form | summary | order | done
  const [quantity, setQuantity] = useState(1);
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

  const isManualDelivery = product.provider === "manual" && !product.auto_delivery;

  const activationLabel =
    product.activation_field === "email"
      ? "Your email (for activation)"
      : product.activation_field === "username"
      ? "Your username (for activation)"
      : null;

  function reviewOrder() {
    setError("");
    if (product.requires_email && !email) {
      setError(describeError("email_required"));
      return;
    }
    if (product.provider === "manual" && product.activation_field && !activationInfo.trim()) {
      setError(describeError("activation_info_required"));
      return;
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
        body: JSON.stringify({ code: couponInput, product_id: product.id, quantity }),
      });
      const data = await res.json();
      if (data.success) {
        setCoupon(data);
      } else {
        setCoupon(null);
        setCouponError(describeError(data.error, undefined, data.min_order));
      }
    } catch {
      setCouponError("Couldn't check that code — try again.");
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
        quantity,
        email,
        activation_info: activationInfo,
        coupon_code: coupon ? coupon.code : undefined,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!data.success) {
      setError(describeError(data.error, data.available, data.min_order));
      setCoupon(null);
      setStep("form");
      return;
    }
    setOrder(data.order);
    setStep("order");
  }

  const subtotal = Number(product.sell_price) * quantity;
  const total = (coupon ? coupon.final : subtotal).toFixed(2);
  const stepLabels = { form: "1. Details", summary: "2. Review", order: "3. Payment", done: "4. Done" };

  return (
    <Modal title={product.title} onClose={onClose}>
      {step !== "done" && (
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted">
          {stepLabels[step]}
        </p>
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
            <strong>Warranty:</strong> {product.warranty}
          </span>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          {isManualDelivery && (
            <Alert variant="warning">
              This product is delivered manually. Estimated delivery:{" "}
              <strong>{product.delivery || "see details"}</strong>. You'll find it in{" "}
              <strong>My Orders</strong> once it's ready.
            </Alert>
          )}
          <FormInput
            label="Quantity"
            type="number"
            min={1}
            max={product.available_stock}
            value={quantity}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
              // Discount depends on the order value — re-apply after a change.
              setCoupon(null);
            }}
          />
          {product.requires_email && (
            <FormInput
              label="Email for delivery"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          {activationLabel && (
            <FormInput
              label={activationLabel}
              type="text"
              value={activationInfo}
              onChange={(e) => setActivationInfo(e.target.value)}
              placeholder={activationLabel}
              hint="We'll use this to activate your subscription after payment."
            />
          )}
          <Alert variant="error">{error}</Alert>
          <PrimaryButton onClick={reviewOrder} className="w-full">
            Review order
          </PrimaryButton>
        </div>
      )}

      {step === "summary" && (
        <div className="space-y-4 text-sm">
          <div className="divide-y divide-border rounded-lg border border-border">
            <Row label="Product" value={product.title} />
            <Row label="Quantity" value={quantity} mono />
            <Row label="Unit price" value={`$${Number(product.sell_price).toFixed(2)}`} mono />
            {product.requires_email && <Row label="Delivery email" value={email} />}
            {activationLabel && (
              <Row label={activationLabel.replace(" (for activation)", "")} value={activationInfo} />
            )}
            {isManualDelivery && (
              <Row label="Delivery" value={`Manual — ${product.delivery || "see details"}`} />
            )}
            {coupon && (
              <>
                <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} mono />
                <div className="flex justify-between px-3.5 py-3 text-success">
                  <span>Coupon {coupon.code}</span>
                  <span className="font-mono">−${Number(coupon.discount).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between px-3.5 py-3 text-base font-semibold text-ink">
              <span>Total</span>
              <span>${total}</span>
            </div>
          </div>

          <div className="space-y-2">
            {coupon ? (
              <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-soft px-3.5 py-2.5 text-success">
                <span>🎟️ {coupon.code} applied</span>
                <button type="button" onClick={removeCoupon} className="text-xs font-medium underline">
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <FormInput
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  className="font-mono"
                  autoComplete="off"
                />
                <SecondaryButton onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
                  {couponBusy ? "…" : "Apply"}
                </SecondaryButton>
              </div>
            )}
            <Alert variant="error">{couponError}</Alert>
          </div>
          <Alert variant="error">{error}</Alert>
          <div className="flex gap-3">
            <SecondaryButton onClick={() => setStep("form")} className="flex-1">
              Back
            </SecondaryButton>
            <PrimaryButton onClick={confirmOrder} disabled={creating} className="flex-1">
              {creating ? "Creating…" : "Confirm & continue"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === "order" && order && (
        <PaymentPanel
          order={order}
          onDone={(result) => {
            setItems(result.items);
            setManual(result.manual);
            setStep("done");
          }}
        />
      )}

      {step === "done" && manual && (
        <div className="space-y-3 text-sm">
          <p className="font-mono text-xs text-muted">Order #{order?.order_number}</p>
          <Alert variant="success">
            Payment confirmed. This product is delivered manually — estimated delivery{" "}
            <strong>{product.delivery || "soon"}</strong>. Check{" "}
            <Link href="/account/orders" className="underline">
              My Orders
            </Link>{" "}
            once it's ready. If you need support, just quote your order number above.
          </Alert>
          <PrimaryButton onClick={onClose} className="w-full">
            Done
          </PrimaryButton>
        </div>
      )}

      {step === "done" && !manual && (
        <div className="space-y-3 text-sm">
          <p className="font-mono text-xs text-muted">Order #{order?.order_number}</p>
          <p className="text-ink">Delivered. Save these now:</p>
          <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-brand-soft p-3 font-mono text-xs text-ink">
            {(items || []).join("\n\n")}
          </pre>
          <PrimaryButton onClick={onClose} className="w-full">
            Done
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
      <span className={`text-right break-all text-ink ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function describeError(code, available, minOrder) {
  switch (code) {
    case "not_enough_stock":
      return Number(available) > 0
        ? `Only ${available} left — lower the quantity and try again.`
        : "Sorry, this product just sold out. Please check back soon.";
    case "supplier_unavailable":
      return "This product is temporarily unavailable. Please try again later.";
    case "email_required":
      return "This product needs an email address for delivery.";
    case "activation_info_required":
      return "Please enter the info needed to activate your subscription.";
    case "invalid_coupon":
      return "That coupon code isn't valid.";
    case "coupon_inactive":
      return "That coupon is no longer active.";
    case "coupon_expired":
      return "That coupon has expired.";
    case "coupon_wrong_product":
      return "That coupon doesn't apply to this product.";
    case "coupon_min_order":
      return `This coupon needs an order of at least $${Number(minOrder || 0).toFixed(2)}.`;
    case "coupon_used_up":
      return "That coupon has reached its usage limit.";
    case "coupon_already_used":
      return "You've already used this coupon.";
    default:
      return code ? code.replaceAll("_", " ") : "";
  }
}
