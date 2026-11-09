import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { LOCALES } from "../lib/i18n";
import { useT } from "../lib/i18n";

// Language dropdown (English / العربية / Русский). The choice is the URL
// (/, /ar, /ru) and is also remembered in localStorage for next visit.
export default function LanguageSwitcher({ className = "" }) {
  const router = useRouter();
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(code) {
    setOpen(false);
    try {
      localStorage.setItem("lang", code);
    } catch {}
    if (code !== locale) router.push(router.asPath, router.asPath, { locale: code });
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Language")}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-ink transition hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <span>{current.short}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute end-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-sm shadow-card-hover"
        >
          {LOCALES.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === locale}
                onClick={() => pick(l.code)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-start hover:bg-brand-soft ${
                  l.code === locale ? "font-semibold text-brand" : "text-ink"
                }`}
              >
                <span>{l.native}</span>
                {l.code === locale && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
