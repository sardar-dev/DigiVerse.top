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
import { useT, intlLocale } from "../../lib/i18n";

export default function Orders() {
  const { t, locale } = useT();
  const STATUS_LABEL = {
    pending_payment: t("Awaiting payment"),
    payment_submitted: t("Verifying payment"),
    paid: t("Paid — fulfilling"),
    fulfilling: t("Fulfilling"),
    awaiting_manual_fulfillment: t("Awaiting manual delivery"),
    needs_reconciliation: t("Confirming delivery"),
    delivered: t("Delivered"),
    failed: t("Failed — refund pending"),
    refunded: t("Refunded"),
    cancelled: t("Cancelled"),
  };
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
      window.location.href = locale === "en" ? "/login" : `/${locale}/login`;
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
    if (!window.confirm(t("Are you sure you want to cancel this order?"))) return;
    await fetch("/api/orders/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id }),
    });
    load();
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title={t("My orders")} path="/account/orders" noindex />
      <SiteHeader session={session} onSignOut={() => supabase.auth.signOut()} />

      <main className="flex-1">
        <PageContainer className="py-10" width="max-w-3xl">
          <h1 className="text-2xl font-semibold text-ink">{t("My orders")}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            {t("Need help with an order? Just quote its order number to support.")}
          </p>

          {!orders && <LoadingState label={t("Loading orders…")} />}
          {orders && orders.length === 0 && (
            <EmptyState title={t("No orders yet")} description={t("Items you buy will show up here.")} />
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
                      {o.products?.title || t("Product #{id}", { id: o.product_id })} × {o.quantity}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted">
                      {t("Order #{n}", { n: o.order_number })} · {new Date(o.created_at).toLocaleString(intlLocale(locale))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-ink" dir="ltr">
                      ${Number(o.total).toFixed(2)}
                    </span>
                    <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                  </div>
                </div>

                {o.status === "awaiting_manual_fulfillment" && o.products?.delivery && (
                  <p className="mt-2 text-xs text-muted">
                    {t("Estimated delivery:")} {o.products.delivery}
                  </p>
                )}

                {o.status === "pending_payment" && resuming !== o.id && (
                  <div className="mt-3 flex gap-3">
                    <PrimaryButton onClick={() => setResuming(o.id)} className="px-3 py-1.5 text-xs">
                      {t("Continue payment")}
                    </PrimaryButton>
                    <LinkButton onClick={() => cancelOrder(o.id)} className="text-danger text-xs">
                      {t("Cancel order")}
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
                      {t("Close")}
                    </SecondaryButton>
                  </div>
                )}

                {o.status === "delivered" && o.items?.length > 0 && (
                  <pre dir="ltr" className="mt-3 whitespace-pre-wrap break-all rounded-lg border border-success/20 bg-success-soft p-3 font-mono text-xs text-ink">
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
