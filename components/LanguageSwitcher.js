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
        className="flex h-9 items-center gap-1.5 rounded-xl border border-border/80 bg-surface/90 px-2.5 text-xs sm:text-sm font-medium text-ink shadow-sm transition-all duration-150 hover:border-brand/40 hover:bg-brand-soft/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.98]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <span className="font-semibold text-xs tracking-wider">{current.short}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute end-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-border/90 bg-surface/95 p-1.5 text-xs sm:text-sm shadow-[0_12px_32px_-6px_rgba(23,33,58,0.18)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          {LOCALES.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === locale}
                onClick={() => pick(l.code)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-start transition-colors ${
                  l.code === locale ? "bg-brand-soft font-semibold text-brand" : "text-ink hover:bg-brand-soft/60"
                }`}
              >
                <span>{l.native}</span>
                {l.code === locale && (
                  <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] text-white">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
