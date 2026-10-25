// PrimaryButton / SecondaryButton — shared button styles so every
// page gets consistent hover/focus/active/disabled states instead of
// copy-pasted class strings drifting out of sync.
//
// PrimaryButton has a true 3D look: a darker "bottom edge" (border-b
// + box-shadow) that reads as the button's depth, which visibly
// compresses on press (moves down, edge shrinks) instead of just
// swapping color. Pure CSS/Tailwind — no animation library, no extra
// bundle weight.
export function PrimaryButton({ className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 min-h-11 rounded-lg border-b-[3px] border-brand-dark bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-[0_3px_0_0_rgba(23,33,58,0.15)] transition-all duration-100 hover:bg-brand/90 hover:shadow-[0_3px_0_0_rgba(23,33,58,0.15),0_10px_26px_-8px_rgba(49,105,245,0.65)] active:translate-y-[2px] active:border-b active:shadow-none disabled:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand disabled:active:translate-y-0 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 min-h-11 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-brand-soft active:bg-border disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function DangerButton({ className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 min-h-11 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={`text-sm font-medium text-brand hover:text-brand/80 underline-offset-2 hover:underline disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
