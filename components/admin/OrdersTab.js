import { useState } from "react";
import { FormInput } from "../ui/FormInput";
import { LinkButton, SecondaryButton } from "../ui/Button";
import StatusBadge from "../ui/StatusBadge";
import DataTable from "./DataTable";

// Tiny click-to-copy chip for ids used in support chats.
function CopyChip({ value, label, title }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={title || "Click to copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
        } catch {
          window.prompt("Copy:", String(value));
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-ink hover:bg-brand-soft"
    >
      <span className="truncate">
        {label} {value}
      </span>
      <span aria-hidden="true">{done ? "✓" : "⧉"}</span>
    </button>
  );
}

// What the customer actually received (credentials / links / codes).
function DeliveredItems({ items }) {
  if (!items || (Array.isArray(items) && items.length === 0)) {
    return <span className="text-muted">—</span>;
  }
  const list = Array.isArray(items) ? items : [items];
  return (
    <div className="space-y-1">
      {list.map((it, i) => (
        <div
          key={i}
          className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded bg-bg px-2 py-1 font-mono text-ink"
        >
          {typeof it === "string" ? it : JSON.stringify(it)}
        </div>
      ))}
    </div>
  );
}

export default function OrdersTab({
  orderSearch,
  setOrderSearch,
  digitrustOrders,
  setDigitrustOrders,
  visibleOrders,
  setOrderStatus,
  deleteOrder,
  onDeliverManual,
  onCheckDigitrust,
  onReconcileDelivered,
  onRetrySupplier,
  onRefund,
}) {
  return (
    <>
      <FormInput
        value={orderSearch}
        onChange={(e) => setOrderSearch(e.target.value)}
        placeholder="Search by order #, customer email, product, status, tx hash or supplier order id…"
        className="mb-4 w-full"
        aria-label="Search orders"
      />

      {digitrustOrders && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">DigiTrust's recent orders</span>
            <LinkButton onClick={() => setDigitrustOrders(null)} className="text-xs">
              Close
            </LinkButton>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted">
            {JSON.stringify(digitrustOrders, null, 2)}
          </pre>
        </div>
      )}

      <DataTable minWidth="min-w-[1200px]">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="py-3 px-4">Order #</th>
            <th className="py-3 px-4">Customer</th>
            <th className="py-3 px-4">Product</th>
            <th className="py-3 px-4">Qty × rate</th>
            <th className="py-3 px-4">Total</th>
            <th className="py-3 px-4">Paid with</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Activation info</th>
            <th className="py-3 px-4">Delivered to customer</th>
            <th className="py-3 px-4">Tx hash</th>
            <th className="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleOrders.map((o) => (
            <tr key={o.id} className="border-b border-border align-top last:border-0">
              <td className="py-3 px-4 font-mono text-ink">{o.order_number}</td>
              <td className="py-3 px-4 max-w-[180px] break-all text-ink">
                {o.user_email || <span className="text-muted">unknown</span>}
                {o.email && o.email !== o.user_email && (
                  <div className="text-xs text-muted">delivery: {o.email}</div>
                )}
              </td>
              <td className="py-3 px-4 text-ink">
                {o.products?.title}
                {o.supplier && <div className="text-xs text-muted">via {o.supplier_label || o.supplier}</div>}
                {(() => {
                  const sid = o.supplier_order_id || o.digitrust_order_id;
                  if (sid) return <CopyChip value={sid} label={`${o.supplier_label || "Supplier"} order #`} />;
                  // Idempotent suppliers get our order id as their external id,
                  // so support can still find the order there without their id.
                  if (o.can_retry) {
                    return (
                      <CopyChip
                        value={o.id}
                        label={`${o.supplier_label} ref`}
                        title="Our order id, sent to XPro as externalOrderId — use it to find this order there"
                      />
                    );
                  }
                  return null;
                })()}
              </td>
              <td className="py-3 px-4 font-mono text-ink whitespace-nowrap">
                {o.quantity}× ${Number(o.unit_price).toFixed(2)}
              </td>
              <td className="py-3 px-4 font-mono text-ink">
                ${Number(o.total).toFixed(2)}
                {o.coupon_code && (
                  <div className="text-xs text-success">
                    🎟️ {o.coupon_code} (−${Number(o.discount_amount).toFixed(2)})
                  </div>
                )}
              </td>
              <td className="py-3 px-4 text-muted">{o.paid_with || "onchain"}</td>
              <td className="py-3 px-4">
                <StatusBadge status={o.status} />
              </td>
              <td className="py-3 px-4 max-w-[140px] break-all text-muted">
                {o.activation_info || "—"}
              </td>
              <td className="py-3 px-4 max-w-[240px] text-xs">
                <DeliveredItems items={o.items} />
              </td>
              <td className="py-3 px-4 max-w-[160px] break-all font-mono text-xs text-muted">
                {o.tx_hash || "—"}
              </td>
              <td className="py-3 px-4 space-x-3 whitespace-nowrap">
                {o.status === "pending_payment" && (
                  <LinkButton onClick={() => setOrderStatus(o.id, "cancelled")}>Cancel</LinkButton>
                )}
                {o.status === "awaiting_manual_fulfillment" && (
                  <LinkButton onClick={() => onDeliverManual(o)}>Deliver</LinkButton>
                )}
                {o.status === "failed" && (
                  <>
                    <LinkButton onClick={() => onRefund(o)} className="font-semibold text-success">
                      Refund ${Number(o.total).toFixed(2)}
                    </LinkButton>
                    <LinkButton
                      onClick={() => setOrderStatus(o.id, "refunded")}
                      title="Only marks it refunded — use if you already returned the money by hand"
                    >
                      Mark refunded
                    </LinkButton>
                  </>
                )}
                {o.status === "needs_reconciliation" && (
                  <>
                    {o.can_retry ? (
                      <LinkButton onClick={() => onRetrySupplier(o)}>Retry (safe)</LinkButton>
                    ) : (
                      <LinkButton onClick={onCheckDigitrust}>Check DigiTrust</LinkButton>
                    )}
                    <LinkButton onClick={() => onReconcileDelivered(o)}>Mark delivered</LinkButton>
                    <LinkButton onClick={() => setOrderStatus(o.id, "failed")} className="text-danger">
                      Mark failed
                    </LinkButton>
                  </>
                )}
                {["pending_payment", "payment_submitted", "failed", "cancelled"].includes(
                  o.status
                ) && (
                  <LinkButton onClick={() => deleteOrder(o.id)} className="text-danger">
                    Delete
                  </LinkButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
