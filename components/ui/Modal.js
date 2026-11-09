import { useEffect, useRef } from "react";
import { useT } from "../../lib/i18n";

// Accessible dialog: traps Escape to close, focuses itself on open,
// and marks itself up for assistive tech. Used by the Buy modal and
// the admin manual-delivery modal.
export default function Modal({ title, onClose, children, maxWidth = "max-w-md" }) {
  const panelRef = useRef(null);
  const { t } = useT();

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${maxWidth} max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card-hover focus:outline-none sm:rounded-xl sm:p-6`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
          <button
            onClick={onClose}
            aria-label={t("Close dialog")}
            className="-m-1 rounded-md p-2.5 text-muted hover:bg-brand-soft hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
