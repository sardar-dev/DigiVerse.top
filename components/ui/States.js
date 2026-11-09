import { PrimaryButton } from "./Button";
import { useT } from "../../lib/i18n";

// Shared empty / loading / error states so the storefront, account
// pages and admin panel all look and behave the same way when there's
// nothing to show, something's still loading, or a request failed.

export function EmptyState({ title, description, action }) {
  const { t } = useT();
  title = title ?? t("Nothing here yet");
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label }) {
  const { t } = useT();
  label = label ?? t("Loading…");
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted" role="status" aria-live="polite">
      <svg className="h-4 w-4 animate-spin text-brand" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
      </svg>
      {label}
    </div>
  );
}

export function ErrorState({ title, description, onRetry }) {
  const { t } = useT();
  title = title ?? t("Something went wrong");
  description = description ?? t("Please try again in a moment.");
  return (
    <div className="rounded-xl border border-danger/20 bg-danger-soft px-6 py-10 text-center" role="alert">
      <p className="text-sm font-medium text-danger">{title}</p>
      <p className="mt-1 text-sm text-danger/80">{description}</p>
      {onRetry && (
        <div className="mt-4">
          <PrimaryButton onClick={onRetry}>{t("Try again")}</PrimaryButton>
        </div>
      )}
    </div>
  );
}
