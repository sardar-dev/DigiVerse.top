import { useEffect, useState } from "react";
import Link from "next/link";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import { SITE_NAME } from "../lib/siteConfig";

export default function About() {
  const [channel, setChannel] = useState({ link: "", type: "whatsapp" });
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setChannel({ link: d.whatsapp_link || "", type: d.channel_type || "whatsapp" }))
      .catch(() => {});
  }, []);
  const channelName = channel.type === "telegram" ? "Telegram" : "WhatsApp";

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        title="About & contact"
        description={`About ${SITE_NAME}: an independent online store for digital subscriptions and licenses — how ordering, payment, delivery and support work.`}
        path="/about"
      />
      <SiteHeader />
      <main className="flex-1">
        <PageContainer className="space-y-8 py-10" width="max-w-2xl">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-ink">About {SITE_NAME.replace(/\s*\p{Extended_Pictographic}+/gu, "").trim()}</h1>
            <p className="text-sm leading-relaxed text-muted">
              {SITE_NAME} is a small independent online store for digital products — subscriptions,
              licenses and activation codes. We buy from established suppliers and resell at fair
              prices, with automatic delivery wherever the product allows it.
            </p>
          </header>

          <Block title="How an order works">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Create a free account with your email.</li>
              <li>Pick a product. The price, stock and delivery type are shown before you pay.</li>
              <li>Pay with USDT (BEP20) or from your on-site wallet balance.</li>
              <li>Your order details appear right away and stay saved under “My Orders”.</li>
            </ol>
          </Block>

          <Block title="What we ask from you">
            Only your own {SITE_NAME.replace(/\s*\p{Extended_Pictographic}+/gu, "").trim()} account email and password to sign in
            here. For a few products we also ask for the email or username that should receive the
            subscription. We never ask for the password of any other service, and never for card or
            bank details.
          </Block>

          <Block title="Independent reseller">
            We are not affiliated with, endorsed by or sponsored by the owners of the products we
            sell. All product names and trademarks belong to their respective owners.
          </Block>

          <Block title="Refunds & problems">
            If an order can’t be fulfilled, the payment is returned to your wallet balance. Other
            cases are reviewed one by one — see our{" "}
            <Link href="/terms" className="font-medium text-brand hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-brand hover:underline">
              Privacy Policy
            </Link>
            .
          </Block>

          <Block title="Contact & support">
            {channel.link ? (
              <>
                Message us on {channelName}:{" "}
                <a
                  href={channel.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  open our {channelName} channel
                </a>
                . Please include your order number from “My Orders”.
              </>
            ) : (
              <>Use the “Give us feedback” link in the footer and include your order number.</>
            )}
          </Block>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

function Block({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
