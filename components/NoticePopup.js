import { useEffect, useRef, useState } from "react";

// Storefront notice popup. Controlled from Admin → Settings → Notice popup.
// Closing it is remembered per notice version (localStorage), so it comes
// back only when the admin edits the notice.
const KEY = "notice_dismissed_v";

export default function NoticePopup() {
  const [notice, setNotice] = useState(null);
  const closeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const n = d && d.notice;
        if (!n || cancelled) return;
        let seen = null;
        try {
          seen = localStorage.getItem(KEY);
        } catch {}
        if (seen !== n.v) setNotice(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function close() {
    try {
      localStorage.setItem(KEY, notice.v);
    } catch {}
    setNotice(null);
  }

  useEffect(() => {
    if (!notice) return;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  if (!notice) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={notice.title || "Notice"}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-card-hover"
      >
        <div className="h-1.5 bg-gradient-to-r from-brand via-brand-light to-brand" />

        <button
          ref={closeRef}
          onClick={close}
          aria-label="Close notice"
          className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-ink transition hover:bg-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        <div className="px-6 pb-6 pt-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-2xl" aria-hidden="true">
            📢
          </div>
          {notice.title && <h2 className="pr-10 text-xl font-semibold text-ink">{notice.title}</h2>}
          {notice.message && (
            <p className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted">
              {notice.message}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={close}
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-brand-soft"
            >
              Close
            </button>
            {notice.button_label && notice.button_url && (
              <a
                href={notice.button_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="rounded-lg bg-brand px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-dark"
              >
                {notice.button_label}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
