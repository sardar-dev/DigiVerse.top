import { useEffect, useState } from "react";
import PageContainer from "./layout/PageContainer";

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// Public social-proof list: newest 15 deliveries, masked emails.
// Fetched after first paint so it never slows the page down.
export default function RecentOrders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    let off = false;
    fetch("/api/recent-orders")
      .then((r) => r.json())
      .then((d) => !off && setOrders(d.success ? d.orders : []))
      .catch(() => !off && setOrders([]));
    return () => {
      off = true;
    };
  }, []);

  if (!orders || orders.length === 0) return null;

  return (
    <section className="border-t border-border bg-surface" aria-labelledby="recent-orders-title">
      <PageContainer className="py-10">
        <div className="flex items-center justify-center gap-2">
          <h2 id="recent-orders-title" className="text-xl font-semibold text-ink sm:text-2xl">
            Recent orders
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        </div>
        <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
          Real purchases from our customers, delivered instantly.
        </p>
        <ul className="mx-auto mt-6 max-w-2xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-brand-soft/60">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true">
                  ✓
                </span>
                <span className="min-w-0 text-ink">
                  <span className="break-all font-medium">{o.email_masked}</span>{" "}
                  <span className="text-muted">just purchased</span>{" "}
                  <span className="font-medium">
                    {o.quantity}x {o.product_title}
                  </span>
                </span>
              </span>
              <span className="flex-shrink-0 text-xs text-muted">{ago(o.created_at)}</span>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
