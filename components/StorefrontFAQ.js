import { useState } from "react";
import { useT } from "../lib/i18n";
import PageContainer from "./layout/PageContainer";

export const FAQ_DATA = [
  {
    id: "what-is-digiverse",
    question: "What is DigiVerse and what digital products are available?",
    answer:
      "DigiVerse is a premier digital marketplace specializing in genuine software licenses, operating systems (Windows 11 Pro, Windows 10 Pro), office productivity suites, and Meta Muse AI tokens. All stock licenses feature 0-second automated delivery, backed by a 100% genuine activation warranty and multi-chain cryptocurrency checkout with zero added processing fees.",
  },
  {
    id: "how-fast-is-delivery",
    question: "How fast is license key and product delivery?",
    answer:
      "Delivery is instantaneous (0 seconds) for all stock software licenses. The moment your crypto transaction confirms on-chain or you pay via wallet balance, your license key is immediately displayed on screen and permanently saved under your “My Orders” dashboard. Muse AI tokens are delivered automatically to your account using your invite link or code.",
  },
  {
    id: "accepted-crypto-payments",
    question: "Which cryptocurrencies and blockchain networks are accepted?",
    answer:
      "DigiVerse accepts USDT and USDC across three major EVM blockchain networks: BNB Smart Chain (BEP20), Polygon PoS, and Base (Coinbase L2). All transactions are verified on-chain via public RPC nodes with zero gateway surcharges. Customers can also deposit funds to their DigiVerse wallet balance for 1-click instant checkout.",
  },
  {
    id: "muse-ai-tokens-delivery",
    question: "What are Muse AI Tokens and how does delivery work?",
    answer:
      "Muse AI Tokens power image generation, creative workflows, and advanced prompts within Meta Muse AI. DigiVerse delivers packages of 1 Billion Muse AI Tokens directly to your Muse account asynchronously. Simply provide your invite link or code at checkout, and our automated system fulfills your order while providing real-time status tracking.",
  },
  {
    id: "warranty-and-refunds",
    question: "What is DigiVerse's replacement warranty and refund guarantee?",
    answer:
      "Every license key and digital good sold on DigiVerse includes a 100% genuine activation warranty. In the rare event that an order cannot be fulfilled or an activation code encounters an issue, our automated system or 24/7 support team immediately issues a replacement or credits a full refund to your on-site wallet balance.",
  },
  {
    id: "referral-rewards-program",
    question: "How does the free Referral Reward Box program work?",
    answer:
      "When friends register through your personal referral link, you earn free gift boxes with 0-second instant unlock (zero lock delay). Each gift box redeems for 1 Billion Muse AI Tokens. Clicking “Claim Gift” on your referrals dashboard automatically applies your reward at checkout for an instant $0.00 total.",
  },
];

export default function StorefrontFAQ() {
  const { t } = useT();
  const [openIndex, setOpenIndex] = useState(0); // first question open by default for immediate AEO readability

  const toggle = (idx) => {
    setOpenIndex((curr) => (curr === idx ? null : idx));
  };

  return (
    <section className="border-t border-border/70 bg-bg py-14 sm:py-18" aria-label="Frequently Asked Questions">
      <PageContainer width="max-w-4xl" className="space-y-8">
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            <span>💡</span>
            <span>{t("Knowledge Base & Help")}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            {t("Frequently Asked Questions")}
          </h2>
          <p className="mx-auto max-w-xl text-xs sm:text-sm text-muted">
            {t(
              "Everything you need to know about genuine software licenses, 0-second delivery, crypto payments, and Muse AI tokens."
            )}
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_DATA.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                  isOpen
                    ? "border-brand/40 bg-surface shadow-md"
                    : "border-border/80 bg-surface/80 hover:border-border hover:bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-4 sm:p-5 text-start font-semibold text-ink text-sm sm:text-base focus:outline-none"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                      Q
                    </span>
                    <span>{t(item.question)}</span>
                  </span>
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted transition-transform duration-200 ${
                      isOpen ? "rotate-180 bg-brand text-white border-brand" : "bg-bg"
                    }`}
                  >
                    ▼
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border/50 px-4 pb-5 pt-3 sm:px-5 sm:pb-5">
                    <p className="text-xs sm:text-sm leading-relaxed text-muted ps-8.5">
                      {t(item.answer)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PageContainer>
    </section>
  );
}
