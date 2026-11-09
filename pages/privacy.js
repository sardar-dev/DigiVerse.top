import Link from "next/link";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import PageContainer from "../components/layout/PageContainer";
import { SITE_NAME } from "../lib/siteConfig";
import { useT, intlLocale } from "../lib/i18n";

export default function Privacy() {
  const { t, locale } = useT();
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO
        title={t("Privacy Policy")}
        description={t("Privacy Policy for {site} — what data we collect and how it's used.", { site: SITE_NAME })}
        path="/privacy"
      />
      <SiteHeader />

      <main className="flex-1">
        <PageContainer className="space-y-6 py-10" width="max-w-2xl">
          <h1 className="text-2xl font-semibold text-ink">{t("Privacy Policy")}</h1>
          <p className="text-xs text-muted">
            {t("Last updated: {date}", { date: new Date().toLocaleDateString(intlLocale(locale)) })}
          </p>

          <div className="space-y-6 text-sm leading-relaxed text-ink">
            <p>{t("This Policy explains what information {site} collects and how it's used.", { site: SITE_NAME })}</p>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-ink">{t("1. What we collect")}</h2>
              <ul className="list-disc space-y-1 ps-5 text-muted">
                <li>{t("Account information: your email address and password (stored securely, hashed).")}</li>
                <li>{t("Order information: products purchased, quantities, prices, and delivery details.")}</li>
                <li>
                  {t(
                    "Payment information: the on-chain transaction hash you submit, and the wallet address it came from — we never ask for or store private keys."
                  )}
                </li>
                <li>
                  {t(
                    "Basic technical data (like IP address) collected automatically by our hosting provider for security and abuse prevention."
                  )}
                </li>
              </ul>
            </section>

            <Section title={t("2. How it's used")}>
              {t(
                "We use this information to process orders, verify payments on-chain, deliver products, maintain your wallet balance, provide customer support, and keep the Site secure."
              )}
            </Section>

            <Section title={t("3. Third parties")}>
              {t(
                "We use Supabase for authentication and data storage, and public BNB Smart Chain nodes to verify payments — both process data only as needed to provide the Site. Blockchain transactions themselves are public by nature and visible to anyone, independent of this Site."
              )}
            </Section>

            <Section title={t("4. Data retention")}>
              {t(
                "We keep account and order data for as long as your account is active, and as needed for support, fraud prevention, and legal recordkeeping afterward."
              )}
            </Section>

            <Section title={t("5. Your rights")}>
              {t(
                "You can ask us to access, correct, or delete your account data by contacting us through the channel linked on the Site — note that on-chain transaction records themselves cannot be deleted, as they exist on the public blockchain independent of us."
              )}
            </Section>

            <Section title={t("6. Contact")}>
              {t("Reach us through the WhatsApp channel linked on the Site.")}
            </Section>
          </div>

          <p className="pt-4">
            <Link href="/terms" className="font-medium text-brand hover:underline">
              {t("Terms of Service")}
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
