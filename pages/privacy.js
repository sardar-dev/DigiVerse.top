import Link from "next/link";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import { SITE_NAME } from "../lib/siteConfig";

export default function Privacy() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        title="Privacy Policy"
        description={`Privacy Policy for ${SITE_NAME} — what data we collect and how it's used.`}
        path="/privacy"
      />
      <SiteHeader />

      <main className="flex-1">
        <PageContainer className="space-y-6 py-10" width="max-w-2xl">
          <h1 className="text-2xl font-semibold text-ink">Privacy Policy</h1>
          <p className="text-xs text-muted">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="space-y-6 text-sm leading-relaxed text-ink">
            <p>This Policy explains what information {SITE_NAME} collects and how it's used.</p>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-ink">1. What we collect</h2>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>Account information: your email address and password (stored securely, hashed).</li>
                <li>Order information: products purchased, quantities, prices, and delivery details.</li>
                <li>
                  Payment information: the on-chain transaction hash you submit, and the wallet
                  address it came from — we never ask for or store private keys.
                </li>
                <li>
                  Basic technical data (like IP address) collected automatically by our hosting
                  provider for security and abuse prevention.
                </li>
              </ul>
            </section>

            <Section title="2. How it's used">
              We use this information to process orders, verify payments on-chain, deliver
              products, maintain your wallet balance, provide customer support, and keep the Site
              secure.
            </Section>

            <Section title="3. Third parties">
              We use Supabase for authentication and data storage, and public BNB Smart Chain
              nodes to verify payments — both process data only as needed to provide the Site.
              Blockchain transactions themselves are public by nature and visible to anyone,
              independent of this Site.
            </Section>

            <Section title="4. Data retention">
              We keep account and order data for as long as your account is active, and as needed
              for support, fraud prevention, and legal recordkeeping afterward.
            </Section>

            <Section title="5. Your rights">
              You can ask us to access, correct, or delete your account data by contacting us
              through the channel linked on the Site — note that on-chain transaction records
              themselves cannot be deleted, as they exist on the public blockchain independent of
              us.
            </Section>

            <Section title="6. Contact">
              Reach us through the WhatsApp channel linked on the Site.
            </Section>
          </div>

          <p className="pt-4">
            <Link href="/terms" className="font-medium text-brand hover:underline">
              Terms of Service
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
