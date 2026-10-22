import { useState } from "react";
import Link from "next/link";
import FeedbackModal from "../FeedbackModal";
import { SITE_NAME } from "../../lib/siteConfig";

export default function SiteFooter() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted sm:px-6">
        <span>© {new Date().getFullYear()} {SITE_NAME}</span>
        <Link href="/about" className="hover:text-ink hover:underline">
          About &amp; contact
        </Link>
        <Link href="/terms" className="hover:text-ink hover:underline">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-ink hover:underline">
          Privacy Policy
        </Link>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="hover:text-ink hover:underline"
        >
          Give us feedback to improve
        </button>
      </div>
      <p className="mx-auto max-w-5xl px-4 pb-6 text-xs leading-relaxed text-muted sm:px-6">
        {SITE_NAME} is an independent reseller of digital products. We are not affiliated with, endorsed by or
        sponsored by the owners of any product or brand named on this site; all names and trademarks belong to
        their respective owners. We never ask for the password of any third-party account.
      </p>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </footer>
  );
}
