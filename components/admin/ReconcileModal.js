import { useState } from "react";
import Modal from "../ui/Modal";
import { FormTextarea } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../ui/Button";

// Replaces the prompt() used for marking a needs_reconciliation order
// delivered, calling the exact same /api/admin/orders POST body the
// original used: { id, status: 'delivered', items }.
export default function ReconcileModal({ order, onClose, onResolved }) {
  const [items, setItems] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!items.trim()) return;
    setBusy(true);
    await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, status: "delivered", items }),
    });
    setBusy(false);
    onResolved();
  }

  return (
    <Modal title={`Mark order #${order.order_number} delivered`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {order.failure_reason && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs">
            <div className="font-semibold text-amber-400 flex items-center gap-1.5">
              <span>⚠️ Review Reason / Upstream Notice:</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-ink break-all">
              {order.failure_reason}
            </div>
          </div>
        )}
        <FormTextarea
          label="Delivered items — one per line (from DigiTrust's order history)"
          value={items}
          onChange={(e) => setItems(e.target.value)}
          rows={5}
          autoFocus
        />
        <div className="flex gap-3">
          <SecondaryButton onClick={onClose} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={!items.trim() || busy} className="flex-1">
            {busy ? "Saving…" : "Mark delivered"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
