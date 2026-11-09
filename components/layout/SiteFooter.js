import { useEffect, useState } from "react";
import Link from "next/link";
import FeedbackModal from "../FeedbackModal";
import { SITE_NAME } from "../../lib/siteConfig";
import { supabase } from "../../lib/supabaseClient";
import { useT } from "../../lib/i18n";

export default function SiteFooter() {
  const { t } = useT();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data?.session));
  }, []);
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted sm:px-6">
        <span>© {new Date().getFullYear()} {SITE_NAME}</span>
        <Link href="/blog" className="hover:text-ink hover:underline">
          {t("Blog")}
        </Link>
        <Link href="/about" className="hover:text-ink hover:underline">
          {t("About & contact")}
        </Link>
        <Link href="/terms" className="hover:text-ink hover:underline">
          {t("Terms of Service")}
        </Link>
        <Link href="/privacy" className="hover:text-ink hover:underline">
          {t("Privacy Policy")}
        </Link>
        {loggedIn && (
          <Link href="/account/support" className="hover:text-ink hover:underline">
            {t("Support")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="hover:text-ink hover:underline"
        >
          {t("Give us feedback to improve")}
        </button>
      </div>
      <p className="mx-auto max-w-5xl px-4 pb-6 text-xs leading-relaxed text-muted sm:px-6">
        {t(
          "{site} is an independent reseller of digital products. We are not affiliated with, endorsed by or sponsored by the owners of any product or brand named on this site; all names and trademarks belong to their respective owners. We never ask for the password of any third-party account.",
          { site: SITE_NAME }
        )}
      </p>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </footer>
  );
}
