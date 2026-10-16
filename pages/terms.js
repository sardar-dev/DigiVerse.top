import Link from "next/link";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import { SITE_NAME } from "../lib/siteConfig";

export default function Terms() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        title="Terms of Service"
        description={`Terms of Service for ${SITE_NAME} — digital products, USDT (BEP20) payments, delivery and refunds.`}
        path="/terms"
      />
      <SiteHeader />

      <main className="flex-1">
        <PageContainer className="space-y-6 py-10" width="max-w-2xl">
          <h1 className="text-2xl font-semibold text-ink">Terms of Service</h1>
          <p className="text-xs text-muted">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="space-y-6 text-sm leading-relaxed text-ink">
            <p>
              These Terms govern your use of {SITE_NAME} (the "Site"). By creating an account or
              placing an order, you agree to these Terms.
            </p>

            <Section title="1. What we sell">
              We sell digital products (accounts, subscriptions, licenses, and similar items).
              Delivery is either instant/automatic or manual, as shown on each product before you
              pay. Manual items are fulfilled by an administrator within the estimated time shown
              at checkout.
            </Section>

            <Section title="2. Payments">
              Payments are accepted in USDT on the BEP20 (BNB Smart Chain) network, or from your
              wallet balance on this Site. Cryptocurrency transactions are irreversible — sending
              funds to the wrong network or address may result in permanent loss, and we cannot
              recover funds sent incorrectly. Double check the network and address shown at
              checkout before sending.
            </Section>

            <Section title="3. Digital goods and refunds">
              Because our products are digital and delivered electronically, sales are generally
              final once an item has been delivered. If an order cannot be fulfilled (for example,
              the item sold out at the last moment), we will refund the payment or credit it to
              your wallet balance. Refund requests for other reasons are reviewed case by case —
              contact us through the channel linked on the Site.
            </Section>

            <Section title="4. Account responsibilities">
              You're responsible for keeping your account credentials secure and for all activity
              under your account. You must provide accurate information (including a working
              email address, where a product requires one) for delivery purposes.
            </Section>

            <Section title="5. Prohibited use">
              You may not use the Site for any unlawful purpose, to defraud us or other users, to
              attempt to manipulate stock/pricing/payment systems, or to resell purchased items in
              violation of the original provider's terms.
            </Section>

            <Section title="6. Limitation of liability">
              The Site is provided "as is." To the extent permitted by law, we are not liable for
              indirect or consequential losses, including losses from network congestion,
              blockchain delays, or third-party service outages outside our control.
            </Section>

            <Section title="7. Changes">
              We may update these Terms from time to time. Continued use of the Site after changes
              means you accept the updated Terms.
            </Section>

            <Section title="8. Contact">
              Reach us through the WhatsApp channel linked on the Site.
            </Section>
          </div>

          <p className="pt-4">
            <Link href="/privacy" className="font-medium text-brand hover:underline">
              Privacy Policy
            </Link>
          </p>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="text-muted">{children}</p>
    </section>
  );
}
