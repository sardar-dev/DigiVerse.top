import { useEffect, useState } from "react";
import { FormTextarea } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton, DangerButton } from "../ui/Button";
import Alert from "../ui/Alert";

const ERRORS = {
  content_required: "Write the content for at least one box.",
  too_many_boxes: "That's too many boxes at once (max 200).",
  box_too_long: "A box is too long (max 5000 characters).",
  box_already_sold: "That box was already sold, so it can't be changed.",
  not_an_auto_delivery_product: "Turn on auto delivery and save the product first.",
};

// Box 1, Box 2, ... for one auto-delivery product. Each paying customer
// gets their own unsold box. Sold boxes stay as read-only history.
export default function StockBoxesManager({ productId, onChanged }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(null); // { id, content }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  async function load() {
    const res = await fetch(`/api/admin/stock-items?product_id=${productId}`);
    const data = await res.json();
    if (data.success) setItems(data.items);
  }

  useEffect(() => {
    setItems(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function call(method, body, okText) {
    setBusy(true);
    setMessage({ type: "", text: "" });
    const res = await fetch("/api/admin/stock-items", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      if (okText) setMessage({ type: "success", text: okText(data) });
      await load();
      onChanged?.();
      return true;
    }
    setMessage({ type: "error", text: ERRORS[data.error] || data.error });
    return false;
  }

  async function add() {
    const ok = await call(
      "POST",
      { product_id: productId, content: text },
      (d) => `Added ${d.added} box${d.added === 1 ? "" : "es"}.`
    );
    if (ok) setText("");
  }

  async function saveEdit() {
    const ok = await call("PATCH", { id: editing.id, content: editing.content }, () => "Saved.");
    if (ok) setEditing(null);
  }

  async function remove(item) {
    if (!window.confirm("Delete this box?")) return;
    await call("DELETE", { id: item.id }, () => "Box deleted.");
  }

  const available = (items || []).filter((i) => i.status === "available").length;
  const sold = (items || []).length - available;

  return (
    <div className="space-y-4 rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Delivery boxes</h3>
        <span className="text-xs text-muted">
          {available} available · {sold} sold
        </span>
      </div>

      <div className="space-y-2">
        <FormTextarea
          label="Add box content"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"email: user@example.com\npassword: ••••••"}
          className="font-mono text-xs"
          hint="This exact text is sent to the customer after payment. To add several boxes at once, put a line with only --- between them."
        />
        <PrimaryButton onClick={add} disabled={busy || !text.trim()}>
          {busy ? "Saving…" : "Add box(es)"}
        </PrimaryButton>
      </div>

      <Alert variant={message.type === "success" ? "success" : "error"}>{message.text}</Alert>

      {items === null && <p className="text-sm text-muted">Loading boxes…</p>}
      {items && items.length === 0 && (
        <p className="text-sm text-muted">No boxes yet — add the first one above.</p>
      )}

      <ul className="space-y-2">
        {(items || []).map((item, i) => (
          <li key={item.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-ink">Box {i + 1}</span>
              {item.status === "sold" ? (
                <span className="rounded-full bg-border px-2.5 py-0.5 text-xs text-muted">
                  Sold{item.orders?.order_number ? ` · order #${item.orders.order_number}` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs text-success">
                  Available
                </span>
              )}
            </div>

            {editing?.id === item.id ? (
              <div className="mt-2 space-y-2">
                <FormTextarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  rows={4}
                  className="font-mono text-xs"
                />
                <div className="flex gap-2">
                  <PrimaryButton onClick={saveEdit} disabled={busy} className="px-3 py-1.5 text-xs">
                    Save
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs">
                    Cancel
                  </SecondaryButton>
                </div>
              </div>
            ) : (
              <>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg p-2 font-mono text-xs text-ink">
                  {item.content}
                </pre>
                {item.status === "available" && (
                  <div className="mt-2 flex gap-2">
                    <SecondaryButton
                      onClick={() => setEditing({ id: item.id, content: item.content })}
                      className="px-3 py-1.5 text-xs"
                    >
                      Edit
                    </SecondaryButton>
                    <DangerButton onClick={() => remove(item)} className="px-3 py-1.5 text-xs">
                      Delete
                    </DangerButton>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
