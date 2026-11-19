import { useState } from "react";
import Modal from "../ui/Modal";
import { FormTextarea } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import Alert from "../ui/Alert";

// Replaces the old browser prompt() with an accessible modal, while
// calling the exact same /api/admin/manual-deliver endpoint with the
// exact same { order_id, items } body the original used.
export default function ManualDeliverModal({ order, onClose, onDelivered }) {
  const [items, setItems] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!items.trim()) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/manual-deliver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order.id, items }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.success) {
      setError(`Failed: ${data.error}`);
      return;
    }
    onDelivered();
  }

  return (
    <Modal title={`Deliver order #${order.order_number}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {order.activation_info && (
          <p className="rounded-lg border border-border bg-brand-soft p-3 text-ink">
            Activation info: <span className="font-mono">{order.activation_info}</span>
          </p>
        )}
        {order.failure_reason && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs">
            <div className="font-semibold text-amber-400 flex items-center gap-1.5">
              <span>⚠️ Reason for Manual Delivery / Upstream Error:</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-ink break-all">
              {order.failure_reason}
            </div>
          </div>
        )}
        <FormTextarea
          label="Delivered item(s) / instructions — one per line"
          value={items}
          onChange={(e) => setItems(e.target.value)}
          rows={5}
          autoFocus
        />
        <Alert variant="error">{error}</Alert>
        <div className="flex gap-3">
          <SecondaryButton onClick={onClose} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={!items.trim() || busy} className="flex-1">
            {busy ? "Delivering…" : "Mark as delivered"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
