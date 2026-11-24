import Link from "next/link";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import { fetchStorefrontProducts } from "../lib/storefrontProducts";
import { toProductCode } from "../lib/productLink";
import { getProductUrl } from "../lib/productSlug";
import { SITE_URL } from "../lib/siteConfig";
import { useT } from "../lib/i18n";

// Landing page for the search "buy muse ai tokens". Rendered on the server and
// cached at the CDN for 5 minutes (same pattern as the homepage), so a visit
// costs almost nothing, the price/stock below stays live, and a deploy never
// depends on the database being reachable. It only READS the product list; it
// never changes the storefront, checkout or any other page.
//
// Keep LAST_UPDATED honest: bump it whenever the facts in this page are
// re-checked (Meta plans, availability, how the top-up works).
const LAST_UPDATED = "2026-11-19";

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export async function getServerSideProps({ res }) {
  let products = [];
  let failed = false;
  try {
    const { data, error } = await withTimeout(fetchStorefrontProducts(), 6000);
    if (error) throw error;
    products = (data || [])
      .filter((p) => /muse/i.test(`${p.title} ${p.short_description || ""}`))
      .map((p) => ({
        id: String(p.id),
        code: toProductCode(p.id),
        title: String(p.title || "")
          .replace(/\b(?:muse\s+)?buff\s*tokens?\b/gi, "Muse AI Tokens")
          .replace(/\s+/g, " ")
          .trim(),
        price: Number(p.sell_price) || 0,
        inStock: Number(p.available_stock || 0) > 0 || Boolean(p.tunvn_buff),
        topUp: Boolean(p.tunvn_buff),
        manual:
          p.delivery_badge === "manual"
            ? true
            : p.delivery_badge === "auto"
            ? false
            : p.provider === "manual" && !p.auto_delivery,
      }))
      .filter((p) => p.price > 0)
      .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.price - b.price)
      .slice(0, 8);
  } catch {
    failed = true; // page still renders, just without the live list
  }
  // Short cache when the database failed, so a hiccup is not served for long.
  res.setHeader(
    "Cache-Control",
    failed ? "public, s-maxage=15, stale-while-revalidate=60" : "public, s-maxage=300, stale-while-revalidate=600"
  );
  return { props: { products } };
}

const FAQ = [
  {
    q: "Can I buy Muse AI tokens?",
    a: "Yes. Meta sells additional Muse tokens itself in the Muse app and on muse.ai, and independent sellers such as DigiVerse offer Muse token top-ups too. If Meta's own checkout works for you, that is the official route. DigiVerse is useful if you prefer to pay with USDT, USDC or a wallet balance.",
  },
  {
    q: "How do I buy Muse AI tokens on DigiVerse?",
    a: "Choose a Muse product above, enter your Muse invite code and the amount, then pay with crypto or your DigiVerse wallet balance. The tokens are credited to the account that owns that invite code. You can follow the order status under My Orders.",
  },
  {
    q: "What payment methods can I use?",
    a: "USDT and USDC on Polygon, Base or BNB Chain, or your DigiVerse wallet balance. Checkout shows the exact amount and address before you pay.",
  },
  {
    q: "How long does delivery take?",
    a: "Token top-ups are normally credited within 10–15 minutes. If your order has not been credited after about 30 minutes, contact support from the support desk or on Telegram and we will check it.",
  },
  {
    q: "Do you need my Muse password?",
    a: "No. For a token top-up we only need your Muse invite code. Never share your Meta or Muse password with anyone, including us.",
  },
  {
    q: "Is DigiVerse affiliated with Meta?",
    a: "No. DigiVerse is an independent reseller. We are not affiliated with, endorsed by or sponsored by Meta, and Muse is a product and trademark of its owner. Meta's own terms apply to your Muse account, so read them before you use a third-party top-up.",
  },
  {
    q: "Will buying tokens make Muse work in my country?",
    a: "No. Muse access depends on your Meta account and region, not on how many tokens you hold. As of late October 2026, third-party trackers list the US, Canada, Japan and Singapore as supported, and Meta says Muse is still in limited testing. Check Meta's pages for the current list.",
  },
  {
    q: "What if my order cannot be completed?",
    a: "If an order cannot be fulfilled, we refund the payment or credit it to your wallet balance. Because the products are digital, sales are generally final once an item has been delivered, and other refund requests are reviewed case by case. See our Terms of Service for the full wording.",
  },
];

const money = (n) => `$${Number(n).toFixed(2)}`;

export default function MuseTokens({ products }) {
  const { t } = useT();
  const url = `${SITE_URL}/muse-ai-tokens`;
  const available = products.filter((p) => p.inStock);

  const graph = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: "Buy Muse AI Tokens with USDT or Wallet Balance",
      description:
        "Buy Muse AI tokens with USDT, USDC or wallet balance. How the top-up works, what it costs, delivery time, and how it compares with buying from Meta.",
      dateModified: LAST_UPDATED,
      inLanguage: "en",
      isPartOf: { "@type": "WebSite", name: "DigiVerse", url: SITE_URL },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Muse AI Tokens", item: url },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
  // Product markup only when there is real, live offer data to describe.
  if (products.length > 0) {
    const prices = (available.length ? available : products).map((p) => p.price);
    graph.push({
      "@type": "Product",
      name: "Muse AI tokens",
      description: "Muse AI token top-ups and accounts sold by DigiVerse, an independent reseller.",
      brand: { "@type": "Brand", name: "Muse" },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: Math.min(...prices).toFixed(2),
        highPrice: Math.max(...prices).toFixed(2),
        offerCount: (available.length ? available : products).length,
        availability: available.length ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: "DigiVerse", url: SITE_URL },
      },
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        title="Buy Muse AI Tokens with USDT, Fast Delivery"
        description="Buy Muse AI tokens with USDT, USDC or wallet balance. See live prices, how the invite-code top-up works, delivery time and how it compares with Meta."
        path="/muse-ai-tokens"
        englishOnly
        keywords="buy muse ai tokens, muse ai tokens, muse token top up, buy muse ai access, muse ai invite code, muse tokens usdt"
        jsonLd={{ "@context": "https://schema.org", "@graph": graph }}
      />
      <SiteHeader />
      <main className="flex-1" lang="en" dir="ltr">
        <PageContainer className="space-y-10 py-10" width="max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <Link href="/" className="hover:underline">{t("Home")}</Link> / Muse AI Tokens
          </nav>

          <header className="space-y-4">
            <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Buy Muse AI Tokens with USDT or Wallet Balance
            </h1>
            <p className="text-xs text-muted">Last checked {LAST_UPDATED}</p>
            <div className="rounded-xl border border-brand/20 bg-brand-soft p-5 text-sm leading-relaxed text-ink">
              <strong className="font-semibold">Short answer:</strong> pick a Muse product below, enter your Muse
              invite code and the amount, and pay with USDT, USDC or your DigiVerse wallet. The tokens are credited
              to your own Muse account, with auto delivery in about 10–15 minutes. We never ask for your password.
            </div>
          </header>

          <section aria-labelledby="live" className="space-y-4">
            <h2 id="live" className="text-xl font-semibold text-ink">Muse products available now</h2>
            {products.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
                No Muse product is listed at the moment.{" "}
                <Link href="/?q=muse#catalog" className="font-medium text-brand underline underline-offset-2">
                  Check the store
                </Link>{" "}
                later, or follow our Telegram channel for restocks.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {products.map((p) => (
                  <li key={p.id} className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-5 shadow-card">
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-semibold leading-snug text-ink">{p.title}</h3>
                      <p className="text-xs text-muted">
                        {p.topUp
                          ? "Top-up credited to your own invite code"
                          : p.manual
                          ? "Manual delivery after payment"
                          : "Delivered after payment"}
                      </p>
                      <p className={`text-xs font-medium ${p.inStock ? "text-success" : "text-muted"}`}>
                        {p.inStock ? "In stock" : "Sold out"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-bold text-ink">{money(p.price)}</span>
                      {p.inStock ? (
                        <Link
                          href={getProductUrl(p)}
                          className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90"
                        >
                          Buy now
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm text-muted">
                          Out of stock
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">
              Prices and stock refresh every few minutes. The price shown at checkout is the one you pay. For top-ups,
              the price is per unit of 1 billion tokens.
            </p>
          </section>

          <section aria-labelledby="how" className="space-y-3">
            <h2 id="how" className="text-xl font-semibold text-ink">How the token top-up works</h2>
            <ol className="list-decimal space-y-2 ps-5 leading-relaxed text-ink/90">
              <li><strong className="font-semibold">Get your invite code.</strong> It is the invite code of your own Muse account. You need a Muse account first, and Muse must be available where you live.</li>
              <li><strong className="font-semibold">Choose the amount.</strong> Top-ups are sold in units of 1 billion tokens. Pick how many units you want.</li>
              <li><strong className="font-semibold">Enter the code and pay.</strong> Pay with USDT or USDC (Polygon, Base or BNB Chain) or with your DigiVerse wallet balance.</li>
              <li><strong className="font-semibold">Receive the tokens.</strong> They are credited to the account behind your code, usually within 10–15 minutes. Track the order under My Orders.</li>
            </ol>
            <p className="text-sm leading-relaxed text-muted">
              You never share a password. Double-check the invite code before you pay, because tokens go to whichever
              account owns the code you enter.
            </p>
          </section>

          <section aria-labelledby="what" className="space-y-3">
            <h2 id="what" className="text-xl font-semibold text-ink">What are Muse AI tokens?</h2>
            <p className="leading-relaxed text-ink/90">
              Muse is Meta&apos;s AI agent. Instead of only chatting, it can carry out tasks for you, and every task uses
              up tokens. Your plan gives you a weekly token allowance, and when it runs out you wait for the weekly
              reset, upgrade, or buy more tokens.
            </p>
            <ul className="list-disc space-y-1.5 ps-5 leading-relaxed text-ink/90">
              <li><strong className="font-semibold">Free tier:</strong> Muse is free with a usage limit. Meta&apos;s help page does not state the amount. Reviewers report about 100 million tokens a week, and sources disagree on whether Meta has confirmed that number.</li>
              <li><strong className="font-semibold">Power:</strong> $20 per month with 500 million tokens a week, according to Meta&apos;s help page.</li>
              <li><strong className="font-semibold">Maximum:</strong> $100 per month with 3 billion tokens a week, according to Meta&apos;s help page.</li>
              <li><strong className="font-semibold">Extra tokens:</strong> Meta lets you buy additional tokens once you reach your weekly limit, with or without a subscription. Tokens bought from Meta do not expire.</li>
            </ul>
            <p className="text-sm text-muted">
              Plan details come from Meta&apos;s Help Center and can change. Check the Muse app for the current offer in your country.
            </p>
          </section>

          <section aria-labelledby="compare" className="space-y-3">
            <h2 id="compare" className="text-xl font-semibold text-ink">Buy from Meta or from DigiVerse?</h2>
            <p className="leading-relaxed text-ink/90">
              If Meta&apos;s own checkout is available to you and accepts your payment method, buying from Meta is the
              official route and the one Meta supports. A third-party top-up can make sense if you want to pay with
              crypto or a wallet balance, or want to add tokens in a specific amount without a monthly plan.
            </p>
            <p className="leading-relaxed text-ink/90">
              Keep in mind that DigiVerse is not Meta. We cannot change which countries Muse is available in, and Meta&apos;s
              terms apply to your account. Read them before you decide.
            </p>
          </section>

          <section aria-labelledby="faq" className="space-y-4">
            <h2 id="faq" className="text-xl font-semibold text-ink">Frequently asked questions</h2>
            {FAQ.map(({ q, a }) => (
              <div key={q} className="space-y-1">
                <h3 className="text-base font-semibold text-ink">{q}</h3>
                <p className="leading-relaxed text-ink/90">{a}</p>
              </div>
            ))}
          </section>

          <section aria-labelledby="guides" className="space-y-3">
            <h2 id="guides" className="text-xl font-semibold text-ink">Muse AI guides</h2>
            <ul className="list-disc space-y-1.5 ps-5 text-ink/90">
              <li><Link href="/blog/is-muse-ai-available-in-your-country" className="font-medium text-brand underline underline-offset-2">Is Muse AI available in your country?</Link></li>
              <li><Link href="/blog/muse-ai-free-limit-how-many-tokens" className="font-medium text-brand underline underline-offset-2">Muse AI free limit: how far do the tokens go?</Link></li>
              <li><Link href="/blog/muse-ai-power-vs-maximum" className="font-medium text-brand underline underline-offset-2">Muse AI Power vs Maximum: which plan do you need?</Link></li>
              <li><Link href="/blog/muse-ai-invite-codes-explained" className="font-medium text-brand underline underline-offset-2">Muse AI invite codes explained</Link></li>
              <li><Link href="/meta-muse-ai-alternatives" className="font-medium text-brand underline underline-offset-2">Meta Muse AI alternatives: 9 honest picks</Link></li>
              <li><Link href="/blog/muse-ai-vs-chatgpt-vs-gemini" className="font-medium text-brand underline underline-offset-2">Muse AI vs ChatGPT vs Gemini</Link></li>
            </ul>
          </section>

          <p className="text-xs leading-relaxed text-muted">
            DigiVerse is an independent reseller and is not affiliated with, endorsed by or sponsored by Meta. Muse and
            Meta are trademarks of their owners.
          </p>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
