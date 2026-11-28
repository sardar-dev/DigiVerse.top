import { useState } from "react";
import { FormInput } from "../ui/FormInput";
import { LinkButton, SecondaryButton } from "../ui/Button";
import { TouchCopy, copyToClipboard } from "../ui/CopyButton";
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
        await copyToClipboard(value);
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

// Parses and formats supplier errors (including translations for foreign API responses)
function formatSupplierNotice(reason) {
  if (!reason) return null;
  const raw = String(reason).trim();
  let summary = null;

  if (/thất bại/i.test(raw)) {
    summary = "Supplier Out of Stock / Rejected";
  } else if (/hết hàng/i.test(raw)) {
    summary = "Supplier Out of Stock";
  } else if (/balance too low|số dư không đủ/i.test(raw)) {
    summary = "Supplier Wallet Low Balance";
  } else if (/line_count_mismatch/i.test(raw)) {
    summary = "Supplier Item Count Mismatch";
  } else if (/returned no delivery items/i.test(raw)) {
    summary = "Supplier Delivered Empty Stock";
  } else if (/cannot_take_email/i.test(raw)) {
    summary = "Supplier Does Not Accept Email";
  } else if (/exceeds_paid/i.test(raw)) {
    summary = "Supplier Cost Exceeds Sale Price";
  }

  return { summary, raw };
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
  onRefresh,
  onReload,
  refreshingOrders = false,
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FormInput
          value={orderSearch}
          onChange={(e) => setOrderSearch(e.target.value)}
          placeholder="Search by order #, customer email, product, status, tx hash or supplier order id…"
          className="min-w-[220px] flex-1"
          aria-label="Search orders"
        />
        {onRefresh && (
          <SecondaryButton
            onClick={onRefresh}
            disabled={refreshingOrders}
            title="Refresh orders and settle any fulfilling deliveries"
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className={refreshingOrders ? "inline-block animate-spin" : ""} aria-hidden="true">↻</span>
            <span>{refreshingOrders ? "Refreshing…" : "Refresh"}</span>
          </SecondaryButton>
        )}
      </div>

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
            <th className="py-3 px-4">Order</th>
            <th className="py-3 px-4">Customer</th>
            <th className="py-3 px-4">Product</th>
            <th className="py-3 px-4">Financials</th>
            <th className="py-3 px-4">Delivery</th>
            <th className="py-3 px-4">Tx hash</th>
            <th className="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleOrders.map((o) => {
            const sale = Number(o.total);
            const cost = o.unit_cost != null ? Number(o.unit_cost) * Number(o.quantity) : null;
            const profit = cost != null ? sale - cost : null;
            return (
              <tr key={o.id} className="border-b border-border align-top last:border-0">
              {/* Order # + Status */}
              <td className="py-3 px-4 whitespace-nowrap">
                <div className="font-mono text-sm text-ink">{o.order_number}</div>
                <div className="mt-1"><StatusBadge status={o.status} /></div>
                {o.failure_reason && (() => {
                  const notice = formatSupplierNotice(o.failure_reason);
                  return (
                    <div className="mt-2 max-w-[220px] whitespace-normal rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-left">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                        <span aria-hidden="true">⚠️</span>
                        <span>{notice.summary || "API / Supplier Error"}</span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] leading-tight text-ink break-all">
                        {notice.raw}
                      </div>
                    </div>
                  );
                })()}
              </td>
              {/* Customer + paid with */}
              <td className="py-3 px-4 max-w-[210px] break-all text-ink">
                {o.user_email ? (
                  <TouchCopy value={o.user_email} />
                ) : o.user_username ? (
                  <TouchCopy value={`@${o.user_username}`} />
                ) : (
                  <span className="inline-flex items-center rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
                    {!o.user_id || o.is_guest ? "Guest checkout" : `Account #${String(o.user_id).slice(0, 6)}`}
                  </span>
                )}
                {o.user_email && (!o.user_id || o.is_guest) && (
                  <div className="mt-1">
                    <span className="inline-flex items-center rounded bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted border border-border">
                      Guest
                    </span>
                  </div>
                )}
                {o.email && o.email !== o.user_email && (
                  <TouchCopy value={o.email} prefix="Delivery:" className="mt-1" />
                )}
                <div className="mt-1 text-xs text-muted">{o.paid_with || "onchain"}</div>
              </td>
              {/* Product + supplier */}
              <td className="py-3 px-4 text-ink">
                {o.products?.title}
                {o.supplier && <div className="text-xs text-muted">via {o.supplier_label || o.supplier}</div>}
                {(() => {
                  const sid = o.supplier_order_id || o.digitrust_order_id;
                  if (sid) return <CopyChip value={sid} label={`${o.supplier_label || "Supplier"} order #`} />;
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
              {/* Financials: sale + cost + profit */}
              <td className="py-3 px-4 whitespace-nowrap font-mono text-sm">
                <div className="text-ink">
                  {o.quantity}× ${Number(o.unit_price).toFixed(2)}
                  {" = "}
                  <span className="font-semibold">${sale.toFixed(2)}</span>
                </div>
                {cost != null && (
                  <div className="text-xs text-muted">Cost: ${cost.toFixed(2)}</div>
                )}
                {profit != null && (
                  <div className={`text-xs font-medium ${profit >= 0 ? "text-success" : "text-danger"}`}>
                    Profit: {profit >= 0 ? "+" : ""}${profit.toFixed(2)}
                  </div>
                )}
                {o.coupon_code && (
                  <div className="text-xs text-success">
                    🎟️ {o.coupon_code} (−${Number(o.discount_amount).toFixed(2)})
                  </div>
                )}
              </td>
              {/* Activation info + delivered items */}
              <td className="py-3 px-4 max-w-[260px] text-xs">
                {o.activation_info && (
                  <TouchCopy value={o.activation_info} className="mb-1.5" mono />
                )}
                <DeliveredItems items={o.items} />
              </td>
              <td className="py-3 px-4 max-w-[180px] break-all font-mono text-xs text-muted">
                {o.tx_hash ? <TouchCopy value={o.tx_hash} mono /> : "—"}
              </td>
              <td className="py-3 px-4 space-x-3 whitespace-nowrap">
                {o.status === "pending_payment" && (
                  <LinkButton onClick={() => setOrderStatus(o.id, "cancelled")}>Cancel</LinkButton>
                )}
                {o.status === "awaiting_manual_fulfillment" && (
                  <>
                    {o.is_buff && (
                      <LinkButton
                        onClick={async () => {
                          const apiName = o.buff_provider === "ppure" ? "Ppure Store" : "TunVN";
                          if (!confirm(`Send order #${o.order_number} to ${apiName} API automatically?`)) return;
                          const res = await fetch("/api/admin/orders", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: o.id, action: "retry_buff" }),
                          });
                          const d = await res.json();
                          if (d.success) {
                            alert(d.message || `Order placed with ${apiName} successfully!`);
                            (onReload || onRefresh)?.();
                          } else {
                            alert(`Failed to place on ${apiName}: ${d.error || "unknown"}`);
                            (onReload || onRefresh)?.();
                          }
                        }}
                        title={`Place order directly via ${o.buff_provider === "ppure" ? "Ppure Store" : "TunVN"} API`}
                        className="font-semibold text-brand"
                      >
                        ⚡ Send to API ({o.buff_provider === "ppure" ? "Ppure" : "TunVN"})
                      </LinkButton>
                    )}
                    <LinkButton onClick={() => onDeliverManual(o)} className="font-medium text-brand">
                      {o.is_buff ? "Manual Done" : "Deliver"}
                    </LinkButton>
                    <LinkButton
                      onClick={() => {
                        if (confirm(`Cancel order #${o.order_number} without refunding?`)) {
                          setOrderStatus(o.id, "cancelled");
                        }
                      }}
                      className="text-muted hover:text-danger"
                    >
                      Cancel
                    </LinkButton>
                    <LinkButton
                      onClick={() => onRefund(o)}
                      className="font-semibold text-danger hover:text-danger-hover"
                    >
                      Cancel & Refund
                    </LinkButton>
                  </>
                )}
                {o.status === "fulfilling" && o.is_buff && (
                  <LinkButton
                    onClick={async () => {
                      const res = await fetch("/api/admin/orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: o.id, action: "settle_buff" }),
                      });
                      const d = await res.json();
                      const apiName = o.supplier === "ppure" || o.buff_provider === "ppure" ? "Ppure Store" : "TunVN";
                      alert(`${apiName} status: ${d.state || "unknown"}`);
                      (onReload || onRefresh)?.();
                    }}
                    className="font-medium text-brand"
                  >
                    Check API Status
                  </LinkButton>
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
                      (!o.supplier || o.supplier === "digitrust") && (
                        <LinkButton onClick={onCheckDigitrust}>Check DigiTrust</LinkButton>
                      )
                    )}
                    <LinkButton onClick={() => onReconcileDelivered(o)}>Mark delivered</LinkButton>
                    <LinkButton onClick={() => onRefund(o)} className="font-semibold text-danger">
                      Cancel & Refund
                    </LinkButton>
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
            );
          })}
        </tbody>
      </DataTable>
    </>
  );
}
