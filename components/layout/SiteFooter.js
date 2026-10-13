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
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </footer>
  );
}
