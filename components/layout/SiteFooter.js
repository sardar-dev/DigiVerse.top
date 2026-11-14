import { useEffect, useState } from "react";
import Link from "next/link";
import FeedbackModal from "../FeedbackModal";
import { SITE_NAME_PLAIN } from "../../lib/siteConfig";
import { supabase } from "../../lib/supabaseClient";
import { useT } from "../../lib/i18n";

export default function SiteFooter() {
  const { t } = useT();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [telegramLink, setTelegramLink] = useState("https://t.me/digiverse_top");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data?.session));

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.channel_type === "telegram" && d?.whatsapp_link) {
          setTelegramLink(d.whatsapp_link);
        } else if (d?.telegram_channel_link) {
          setTelegramLink(d.telegram_channel_link);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="mt-auto border-t border-border bg-surface text-ink">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Navigation Grid */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-10">
          {/* Brand & Mission Column */}
          <div className="space-y-4 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <img
                src="/logo-mark.png"
                alt={SITE_NAME_PLAIN}
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl object-cover shadow-xs"
                loading="lazy"
              />
              <span className="text-lg font-bold tracking-tight text-ink">{SITE_NAME_PLAIN}</span>
            </Link>

            <p className="max-w-sm text-xs leading-relaxed text-muted sm:text-sm">
              {t("Premier cloud digital commerce platform for AI tokens, developer licenses, and instant digital assets.")}
            </p>

            {/* Operational Status Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>{t("All Systems Operational")}</span>
            </div>

            {/* Community Telegram Action */}
            <div className="pt-1">
              <a
                href={telegramLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg/50 px-3.5 py-2 text-xs font-semibold text-ink shadow-xs transition-all hover:border-brand-light hover:bg-brand-soft/50"
              >
                <svg className="h-4 w-4 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.5 1.9 12c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.6.2 1.5 1.2z" />
                </svg>
                <span>{t("Join our Telegram Community")}</span>
              </a>
            </div>
          </div>

          {/* Column 2: Products */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink">{t("Products")}</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/" className="text-muted transition-colors hover:text-brand">
                  {t("Storefront Catalog")}
                </Link>
              </li>
              <li>
                <Link href="/?search=Muse" className="text-muted transition-colors hover:text-brand">
                  {t("Muse AI Tokens")}
                </Link>
              </li>
              <li>
                <Link href="/account/referrals" className="flex items-center gap-1.5 text-muted transition-colors hover:text-brand">
                  <span>{t("Referral Rewards")}</span>
                  <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">🎁 FREE</span>
                </Link>
              </li>
              <li>
                <Link href="/account/orders" className="text-muted transition-colors hover:text-brand">
                  {t("Order History")}
                </Link>
              </li>
              <li>
                <Link href="/account/wallet" className="text-muted transition-colors hover:text-brand">
                  {t("Wallet & Top-up")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Support */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink">{t("Support")}</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/account/support" className="text-muted transition-colors hover:text-brand">
                  {t("Customer Support Desk")}
                </Link>
              </li>
              <li>
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted transition-colors hover:text-brand"
                >
                  {t("Telegram Support")}
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="text-left text-muted transition-colors hover:text-brand"
                >
                  {t("Feedback & Suggestions")}
                </button>
              </li>
              <li>
                <Link href="/blog" className="text-muted transition-colors hover:text-brand">
                  {t("Blog & Knowledge Base")}
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-muted transition-colors hover:text-brand">
                  {t("About DigiVerse")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Legal & Trust */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink">{t("Legal")}</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/terms" className="text-muted transition-colors hover:text-brand">
                  {t("Terms of Service")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted transition-colors hover:text-brand">
                  {t("Privacy Policy")}
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-muted transition-colors hover:text-brand">
                  {t("Replacement Warranty")}
                </Link>
              </li>
              {loggedIn && (
                <li>
                  <Link href="/account/orders" className="text-muted transition-colors hover:text-brand">
                    {t("My Account")}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Accepted Payment Methods Bar */}
        <div className="mt-10 border-t border-border pt-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("Accepted Payments:")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1 text-[11px] font-semibold text-ink">
                  <img src="/crypto/usdt.svg" alt="USDT" className="h-3.5 w-3.5 rounded-full" />
                  <span>USDT</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1 text-[11px] font-semibold text-ink">
                  <img src="/crypto/usdc.svg" alt="USDC" className="h-3.5 w-3.5 rounded-full" />
                  <span>USDC</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1 text-[11px] font-semibold text-ink">
                  <img src="/crypto/bsc.svg" alt="BSC" className="h-3.5 w-3.5 rounded-full" />
                  <span>BNB Chain</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1 text-[11px] font-semibold text-ink">
                  <img src="/crypto/polygon.svg" alt="Polygon" className="h-3.5 w-3.5 rounded-full" />
                  <span>Polygon</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1 text-[11px] font-semibold text-ink">
                  <img src="/crypto/base.svg" alt="Base" className="h-3.5 w-3.5 rounded-full" />
                  <span>Base</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1 text-[11px] font-semibold text-ink">
                  <span>👛</span>
                  <span>{t("Balance")}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted">
              <span>⚡ {t("0-Second Instant Delivery")}</span>
              <span className="text-border">·</span>
              <span>🛡️ {t("100% Replacement Warranty")}</span>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer & Copyright */}
        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <p className="text-[11px] leading-relaxed text-muted">
            {t(
              "{site} is an independent reseller of digital products. We are not affiliated with, endorsed by or sponsored by the owners of any product or brand named on this site; all names and trademarks belong to their respective owners. We never ask for the password of any third-party account.",
              { site: SITE_NAME_PLAIN }
            )}
          </p>
          <div className="flex flex-col justify-between gap-2 pt-1 text-xs text-muted sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} {SITE_NAME_PLAIN} (digiverse.top). {t("All rights reserved.")}</span>
            <span>{t("Cloud Digital Commerce")}</span>
          </div>
        </div>
      </div>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </footer>
  );
}
