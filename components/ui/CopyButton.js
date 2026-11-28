import { useState } from "react";
import { SecondaryButton } from "./Button";
import { useT } from "../../lib/i18n";

/**
 * Copies text to the clipboard with a hidden-textarea fallback for
 * browsers/webviews where navigator.clipboard is restricted.
 */
export async function copyToClipboard(value) {
  const text = String(value ?? "");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

// Copies `value` and flashes "Copied!". Falls back to a hidden textarea
// for browsers/webviews where the async clipboard API is unavailable.
export default function CopyButton({ value, label, className = "" }) {
  const [copied, setCopied] = useState(false);
  const { t } = useT();

  async function copy() {
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SecondaryButton
      type="button"
      onClick={copy}
      className={`px-3.5 py-1.5 text-xs ${copied ? "!border-success !text-success" : ""} ${className}`}
    >
      {copied ? t("✓ Copied!") : `📋 ${label}`}
    </SecondaryButton>
  );
}

/**
 * Tactile click/tap-to-copy box for customer usernames, emails, links, and tx hashes.
 */
export function TouchCopy({ value, prefix = "", mono = false, className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  async function handleCopy() {
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Tap or click to copy"
      className={`group flex w-full items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-all active:scale-[0.98] cursor-pointer ${
        copied
          ? "border-success/50 bg-success-soft/40 text-success"
          : "border-border/80 bg-bg/70 text-ink hover:border-brand/50 hover:bg-brand-soft/30"
      } ${className}`}
    >
      <span className={`min-w-0 flex-1 break-all leading-snug ${mono ? "font-mono text-[11px]" : ""}`}>
        {prefix && <span className="font-sans text-[11px] font-medium text-muted me-1">{prefix}</span>}
        {value}
      </span>
      <span
        className={`mt-0.5 flex-shrink-0 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold ${
          copied ? "text-success" : "text-muted group-hover:text-brand"
        }`}
      >
        {copied ? (
          "✓ Copied"
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </span>
    </button>
  );
}

export function StepBadge({ n }) {
  return (
    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
      {n}
    </span>
  );
}
