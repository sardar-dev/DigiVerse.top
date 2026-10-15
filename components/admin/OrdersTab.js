import { FormInput } from "../ui/FormInput";
import { LinkButton, SecondaryButton } from "../ui/Button";
import StatusBadge from "../ui/StatusBadge";
import DataTable from "./DataTable";

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
}) {
  return (
    <>
      <FormInput
        value={orderSearch}
        onChange={(e) => setOrderSearch(e.target.value)}
        placeholder="Search by order #, customer email, product, status, or tx hash…"
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

      <DataTable minWidth="min-w-[900px]">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="py-3 px-4">Order #</th>
            <th className="py-3 px-4">Customer</th>
            <th className="py-3 px-4">Product</th>
            <th className="py-3 px-4">Total</th>
            <th className="py-3 px-4">Paid with</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Activation info</th>
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
              <td className="py-3 px-4 text-ink">{o.products?.title}</td>
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
                  <LinkButton onClick={() => setOrderStatus(o.id, "refunded")}>
                    Mark refunded
                  </LinkButton>
                )}
                {o.status === "needs_reconciliation" && (
                  <>
                    <LinkButton onClick={onCheckDigitrust}>Check DigiTrust</LinkButton>
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
