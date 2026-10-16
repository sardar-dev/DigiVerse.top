import { useState } from "react";
import { SecondaryButton } from "./Button";

// Copies `value` and flashes "Copied!". Falls back to a hidden textarea
// for browsers/webviews where the async clipboard API is unavailable.
export default function CopyButton({ value, label, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SecondaryButton
      type="button"
      onClick={copy}
      className={`px-3.5 py-1.5 text-xs ${copied ? "!border-success !text-success" : ""} ${className}`}
    >
      {copied ? "✓ Copied!" : `📋 ${label}`}
    </SecondaryButton>
  );
}

export function StepBadge({ n }) {
  return (
    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
      {n}
    </span>
  );
}
