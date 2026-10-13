import { useEffect, useState } from "react";
import SectionHeading from "../ui/SectionHeading";
import { SecondaryButton, DangerButton } from "../ui/Button";
import { EmptyState, LoadingState } from "../ui/States";

export default function FeedbackTab({ onUnreadChange }) {
  const [items, setItems] = useState(null);

  async function load() {
    const res = await fetch("/api/admin/feedback");
    const data = await res.json();
    if (data.success) {
      setItems(data.feedback);
      onUnreadChange?.(data.feedback.filter((f) => !f.read).length);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mark(f, read) {
    await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, read }),
    });
    load();
  }

  async function remove(f) {
    if (!window.confirm("Delete this feedback?")) return;
    await fetch("/api/admin/feedback", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id }),
    });
    load();
  }

  if (items === null) return <LoadingState label="Loading feedback…" />;

  return (
    <div className="max-w-3xl space-y-4">
      <SectionHeading
        title="Customer feedback"
        description="Messages sent from the “Give us feedback” link in the site footer."
        action={<SecondaryButton onClick={load}>Refresh</SecondaryButton>}
      />
      {items.length === 0 && <EmptyState title="No feedback yet" />}
      {items.map((f) => (
        <div
          key={f.id}
          className={`rounded-xl border p-4 shadow-card ${
            f.read ? "border-border bg-surface" : "border-brand/40 bg-brand-soft"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <a href={`mailto:${f.email}`} className="font-medium text-brand hover:underline">
              {f.email}
            </a>
            <span>{new Date(f.created_at).toLocaleString()}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{f.message}</p>
          <div className="mt-3 flex gap-2">
            <SecondaryButton onClick={() => mark(f, !f.read)} className="px-3 py-1.5 text-xs">
              {f.read ? "Mark unread" : "Mark read"}
            </SecondaryButton>
            <DangerButton onClick={() => remove(f)} className="px-3 py-1.5 text-xs">
              Delete
            </DangerButton>
          </div>
        </div>
      ))}
    </div>
  );
}
