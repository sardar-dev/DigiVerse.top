// Consistent status pill used on My Orders, admin Orders, and manual
// delivery queues. Never relies on color alone — always paired with a
// text label — for accessibility.
import { useT } from "../../lib/i18n";

const STATUS_STYLES = {
  pending_payment: { label: "Awaiting payment", cls: "bg-warning-soft text-warning" },
  payment_submitted: { label: "Verifying payment", cls: "bg-brand-soft text-brand" },
  paid: { label: "Paid — fulfilling", cls: "bg-brand-soft text-brand" },
  fulfilling: { label: "Fulfilling", cls: "bg-brand-soft text-brand" },
  awaiting_manual_fulfillment: { label: "Awaiting manual delivery", cls: "bg-warning-soft text-warning" },
  needs_reconciliation: { label: "Confirming delivery", cls: "bg-warning-soft text-warning" },
  delivered: { label: "Delivered", cls: "bg-success-soft text-success" },
  failed: { label: "Failed — refund pending", cls: "bg-danger-soft text-danger" },
  refunded: { label: "Refunded", cls: "bg-border text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-border text-muted" },
};

export default function StatusBadge({ status, label }) {
  const { t } = useT();
  const def = STATUS_STYLES[status] || { label: label || status, cls: "bg-border text-muted" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${def.cls}`}
    >
      {label || t(def.label)}
    </span>
  );
}
