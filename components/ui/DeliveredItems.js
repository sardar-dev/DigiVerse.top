import { useState } from "react";
import { useT } from "../../lib/i18n";

/**
 * Normalizes delivered items from an array, newline-separated string, or JSON string.
 */
function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) {
    return items
      .map((it) => (typeof it === "string" ? it.trim() : JSON.stringify(it)))
      .filter((it) => it && it.length > 0);
  }
  if (typeof items === "string") {
    const trimmed = items.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((it) => (typeof it === "string" ? it.trim() : JSON.stringify(it)))
            .filter((it) => it && it.length > 0);
        }
      } catch {}
    }
    return trimmed
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function DeliveredItems({ items, className = "" }) {
  const { t } = useT();
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [allCopied, setAllCopied] = useState(false);

  const list = normalizeItems(items);
  if (list.length === 0) return null;

  async function handleCopyItem(text, index) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }

  async function handleCopyAll() {
    const ok = await copyText(list.join("\n\n"));
    if (ok) {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    }
  }

  // Single item delivery layout
  if (list.length === 1) {
    const isCopied = copiedIndex === 0;
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span>{t("Delivered Content")}</span>
          </span>

          <button
            type="button"
            onClick={() => handleCopyItem(list[0], 0)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 shadow-xs ${
              isCopied
                ? "border-emerald-500 bg-emerald-500 text-white shadow-emerald-500/20"
                : "border-border bg-surface hover:border-brand-light hover:bg-bg text-ink"
            }`}
          >
            {isCopied ? (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{t("✓ Copied!")}</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{t("Copy")}</span>
              </>
            )}
          </button>
        </div>

        <div className="relative group">
          <pre
            dir="ltr"
            className="whitespace-pre-wrap break-all rounded-xl border border-border bg-bg/80 p-3.5 font-mono text-xs sm:text-sm text-ink leading-relaxed select-all shadow-inner"
          >
            {list[0]}
          </pre>
        </div>
      </div>
    );
  }

  // Multiple items delivery layout
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Top Header with Total Count and Copy All */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>{t("Delivered Items ({n})", { n: list.length })}</span>
        </div>

        <button
          type="button"
          onClick={handleCopyAll}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 shadow-xs ${
            allCopied
              ? "border-emerald-500 bg-emerald-500 text-white shadow-emerald-500/20"
              : "border-brand/40 bg-brand-soft/60 hover:bg-brand hover:text-white text-brand"
          }`}
        >
          {allCopied ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{t("✓ All Copied!")}</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{t("Copy All ({n})", { n: list.length })}</span>
            </>
          )}
        </button>
      </div>

      {/* Each individual item */}
      <div className="space-y-2.5">
        {list.map((item, idx) => {
          const isCopied = copiedIndex === idx;
          return (
            <div
              key={idx}
              className="rounded-xl border border-border bg-bg/60 p-3 transition-colors hover:border-brand-light"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-mono text-[11px] font-bold text-muted bg-surface px-2 py-0.5 rounded border border-border">
                  {t("Item #{n}", { n: idx + 1 })}
                </span>

                <button
                  type="button"
                  onClick={() => handleCopyItem(item, idx)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                    isCopied
                      ? "bg-emerald-500 text-white shadow-xs"
                      : "border border-border bg-surface hover:border-brand hover:text-brand text-ink"
                  }`}
                >
                  {isCopied ? (
                    <>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{t("Copied!")}</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>{t("Copy")}</span>
                    </>
                  )}
                </button>
              </div>

              <pre
                dir="ltr"
                className="whitespace-pre-wrap break-all rounded-lg border border-border/80 bg-surface p-2.5 font-mono text-xs text-ink leading-relaxed select-all"
              >
                {item}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
