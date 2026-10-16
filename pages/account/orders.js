import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import PaymentPanel from "../../components/PaymentPanel";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import StatusBadge from "../../components/ui/StatusBadge";
import { EmptyState, LoadingState } from "../../components/ui/States";
import { PrimaryButton, SecondaryButton, LinkButton } from "../../components/ui/Button";

export default function Orders() {
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState(null);
  const [resuming, setResuming] = useState(null); // order id being resumed

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    setSession(session);
    const { data } = await supabase
      .from("orders")
      .select("*, products(title, provider, delivery)")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders(data || []);
  }

  async function cancelOrder(id) {
    await fetch("/api/orders/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id }),
    });
    load();
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title="My orders" path="/account/orders" noindex />
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        <PageContainer className="py-10" width="max-w-3xl">
          <h1 className="text-2xl font-semibold text-ink">My orders</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Need help with an order? Just quote its order number to support.
          </p>

          {!orders && <LoadingState label="Loading orders…" />}
          {orders && orders.length === 0 && (
            <EmptyState title="No orders yet" description="Items you buy will show up here." />
          )}

          <ul className="space-y-4">
            {(orders || []).map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-border bg-surface p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-ink">
                      {o.products?.title || `Product #${o.product_id}`} × {o.quantity}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted">
                      Order #{o.order_number} · {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-ink">
                      ${Number(o.total).toFixed(2)}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                </div>

                {o.status === "awaiting_manual_fulfillment" && o.products?.delivery && (
                  <p className="mt-2 text-xs text-muted">
                    Estimated delivery: {o.products.delivery}
                  </p>
                )}

                {o.status === "pending_payment" && resuming !== o.id && (
                  <div className="mt-3 flex gap-3">
                    <PrimaryButton onClick={() => setResuming(o.id)} className="px-3 py-1.5 text-xs">
                      Continue payment
                    </PrimaryButton>
                    <LinkButton onClick={() => cancelOrder(o.id)} className="text-danger text-xs">
                      Cancel order
                    </LinkButton>
                  </div>
                )}

                {o.status === "pending_payment" && resuming === o.id && (
                  <div className="mt-4 rounded-lg border border-border bg-bg p-4">
                    <PaymentPanel
                      order={o}
                      onDone={() => {
                        setResuming(null);
                        load();
                      }}
                    />
                    <SecondaryButton
                      onClick={() => setResuming(null)}
                      className="mt-3 px-3 py-1.5 text-xs"
                    >
                      Close
                    </SecondaryButton>
                  </div>
                )}

                {o.status === "delivered" && o.items?.length > 0 && (
                  <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg border border-success/20 bg-success-soft p-3 font-mono text-xs text-ink">
                    {o.items.join("\n\n")}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}
