import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminLayout, { ADMIN_TAB_IDS } from "../../components/admin/AdminLayout";
import DashboardTab from "../../components/admin/DashboardTab";
import ProductsTab from "../../components/admin/ProductsTab";
import ManualProductsTab from "../../components/admin/ManualProductsTab";
import OrdersTab from "../../components/admin/OrdersTab";
import DepositsTab from "../../components/admin/DepositsTab";
import FeedbackTab from "../../components/admin/FeedbackTab";
import CouponsTab from "../../components/admin/CouponsTab";
import AiDescriptionsTab from "../../components/admin/AiDescriptionsTab";
import SupportTab from "../../components/admin/SupportTab";
import SuppliersTab from "../../components/admin/SuppliersTab";
import StatsTab from "../../components/admin/StatsTab";
import DebugTab from "../../components/admin/DebugTab";
import SettingsTab from "../../components/admin/SettingsTab";
import ManualDeliverModal from "../../components/admin/ManualDeliverModal";
import ReconcileModal from "../../components/admin/ReconcileModal";
import { LoadingState } from "../../components/ui/States";

export default function Admin() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTabState] = useState("products");
  // Keep the open section in the URL (#orders …) so a refresh — or a
  // shared/bookmarked link — returns to the same page, with no storage
  // or server involved.
  const setTab = (id) => {
    setTabState(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {}
  };
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      if (ADMIN_TAB_IDS.includes(h)) setTabState(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  const [sortAvailableFirst, setSortAvailableFirst] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Wallet adjustment form
  const [adjEmail, setAdjEmail] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjMessage, setAdjMessage] = useState("");
  const [adjResult, setAdjResult] = useState(null);

  // DigiTrust reconciliation
  const [digitrustOrders, setDigitrustOrders] = useState(null);
  const [reconcileOrder, setReconcileOrder] = useState(null);

  // Manual products
  const [manualProducts, setManualProducts] = useState([]);
  const [manualForm, setManualForm] = useState(emptyManualForm());
  const [manualMessage, setManualMessage] = useState("");
  const [boxesVersion, setBoxesVersion] = useState(0); // bumps to refresh the boxes list

  // Manual delivery modal (replaces the old prompt())
  const [deliverOrder, setDeliverOrder] = useState(null);

  // Site settings
  const [whatsappLink, setWhatsappLink] = useState("");
  const [channelType, setChannelType] = useState("whatsapp");
  const [settingsMessage, setSettingsMessage] = useState("");

  async function loadSettings() {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    if (data.success) {
      setWhatsappLink(data.whatsapp_link || "");
      setChannelType(data.channel_type === "telegram" ? "telegram" : "whatsapp");
    }
  }

  async function saveSettings() {
    setSettingsMessage("");
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp_link: whatsappLink, channel_type: channelType }),
    });
    const data = await res.json();
    setSettingsMessage(
      data.success
        ? "Saved."
        : {
            invalid_url: "Failed: that isn't a valid link (it must start with https://).",
            link_not_telegram: "Failed: this is not a Telegram link — use a t.me link, or switch the dropdown to WhatsApp.",
            link_not_whatsapp: "Failed: this is not a WhatsApp link — use a chat.whatsapp.com / wa.me link, or switch the dropdown to Telegram.",
          }[data.error] || `Failed: ${data.error}`
    );
  }

  function emptyManualForm() {
    return {
      id: null,
      title: "",
      description: "",
      short_description: "",
      sell_price: "",
      cost_price: "",
      available_stock: "",
      requires_email: false,
      delivery: "Within 1-6 hours",
      selected: true,
      activation_field: "",
      image_url: "",
      category: "",
      featured: false,
      low_stock_threshold: "",
      auto_delivery: false,
      new_boxes: "",
      box_split: "separator",
    };
  }

  async function loadManualProducts() {
    const res = await fetch("/api/admin/manual-products");
    const data = await res.json();
    if (data.success) setManualProducts(data.products);
  }

  async function saveManualProduct() {
    setManualMessage("");
    const body = {
      ...(manualForm.id !== null ? { id: manualForm.id } : {}),
      title: manualForm.title,
      description: manualForm.description,
      short_description: manualForm.short_description || null,
      sell_price: Number(manualForm.sell_price),
      cost_price: Number(manualForm.cost_price || 0),
      available_stock: Number(manualForm.available_stock),
      requires_email: manualForm.requires_email,
      delivery: manualForm.delivery,
      selected: manualForm.selected,
      activation_field: manualForm.activation_field || null,
      image_url: manualForm.image_url || null,
      category: manualForm.category || null,
      featured: Boolean(manualForm.featured),
      low_stock_threshold:
        manualForm.low_stock_threshold === "" ? null : Number(manualForm.low_stock_threshold),
      // Only sent when on (or when editing a product that has it), so
      // saving ordinary products works before migration_012 is run.
      ...(manualForm.auto_delivery || manualForm._hadAuto
        ? {
            auto_delivery: Boolean(manualForm.auto_delivery),
            new_boxes: manualForm.new_boxes,
            box_split: manualForm.box_split,
          }
        : {}),
    };
    const res = await fetch("/api/admin/manual-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      const isNew = manualForm.id === null;
      loadManualProducts();
      const added = data.added_boxes || 0;
      const boxNote = added ? ` Added ${added} box${added === 1 ? "" : "es"}.` : "";
      if (manualForm.auto_delivery && data.product) {
        // Stay in edit mode so more stock can be pasted in straight away.
        setManualMessage((isNew ? "Created." : "Saved.") + boxNote);
        setBoxesVersion((v) => v + 1);
        editManualProduct(data.product);
      } else {
        setManualMessage(isNew ? "Created." : "Updated.");
        setManualForm(emptyManualForm());
      }
    } else {
      setManualMessage(`Failed: ${data.error}`);
    }
  }

  function editManualProduct(p) {
    setManualForm({
      id: p.id,
      title: p.title,
      description: p.description || "",
      short_description: p.short_description || "",
      sell_price: p.sell_price,
      cost_price: p.cost_price,
      available_stock: p.available_stock,
      requires_email: p.requires_email,
      delivery: p.delivery || "",
      selected: p.selected,
      activation_field: p.activation_field || "",
      image_url: p.image_url || "",
      category: p.category || "",
      featured: Boolean(p.featured),
      low_stock_threshold: p.low_stock_threshold ?? "",
      auto_delivery: Boolean(p.auto_delivery),
      _hadAuto: Boolean(p.auto_delivery),
      new_boxes: "",
      box_split: "separator",
    });
  }

  async function bulkUpdateProducts(ids, patch) {
    await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...patch }),
    });
    loadProducts();
  }

  async function bulkUpdateManualProducts(ids, patch) {
    await fetch("/api/admin/manual-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...patch }),
    });
    loadManualProducts();
  }

  async function archiveManualProduct(id) {
    if (!confirm("Archive this product? It will stop showing on the storefront (existing orders are kept.)")) return;
    await fetch("/api/admin/manual-products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadManualProducts();
  }

  async function deliverManualOrder() {
    loadOrders();
    setDeliverOrder(null);
  }

  // Debug tool state
  const [debugTx, setDebugTx] = useState("");
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();
      if (!profile?.is_admin) {
        setChecking(false);
        return;
      }
      setAllowed(true);
      setChecking(false);
      loadProducts();
      loadOrders();
      loadDashboard();
      loadManualProducts();
      loadSettings();
    })();
  }, []);

  async function loadDashboard() {
    const res = await fetch("/api/admin/dashboard");
    const data = await res.json();
    if (data.success) setDashboard(data);
  }

  async function runManualSync() {
    setSyncing(true);
    setSyncMessage("");
    const res = await fetch("/api/admin/manual-sync", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (data.success) {
      setSyncMessage(
        `Synced ${data.synced} supplier products — ${data.updated ?? data.synced} updated${
          data.newProducts ? `, ${data.newProducts} new` : ""
        }.` +
          (data.suppliers
            ? " " +
              Object.entries(data.suppliers)
                .map(([k, v]) => (v.ok ? `${k}: ${v.count} ✓${v.hint ? ` (${v.hint})` : ""}` : `${k}: FAILED (${v.error})`))
                .join(" · ")
            : "")
      );
      loadProducts();
      loadDashboard();
    } else {
      setSyncMessage(`Failed: ${data.error}`);
    }
  }

  async function submitAdjustment() {
    setAdjMessage("");
    setAdjResult(null);
    const res = await fetch("/api/admin/wallet-adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adjEmail,
        amount: Number(adjAmount),
        reason: adjReason,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setAdjMessage("");
      setAdjResult({ email: adjEmail, amount: Number(adjAmount), balance: Number(data.balance) });
      setAdjEmail("");
      setAdjAmount("");
      setAdjReason("");
    } else {
      setAdjMessage(`Failed: ${data.error}`);
    }
  }

  async function loadDigitrustOrders() {
    const res = await fetch("/api/admin/digitrust-orders");
    const data = await res.json();
    if (data.success) setDigitrustOrders(data.orders);
  }

  async function retrySupplierOrder(order) {
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry_order", order_id: order.id }),
    });
    const data = await res.json();
    if (data.success) {
      alert(data.duplicate ? "Order was already placed at the supplier — delivery recovered." : "Delivered.");
    } else {
      alert(`Retry result: ${data.message || data.error}`);
    }
    loadOrders();
  }

  async function loadProducts() {
    const res = await fetch("/api/admin/products");
    const data = await res.json();
    if (data.success) setProducts(data.products);
  }

  async function loadOrders() {
    const res = await fetch("/api/admin/orders");
    const data = await res.json();
    if (data.success) setOrders(data.orders);
  }

  async function updateProduct(id, patch) {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json().catch(() => ({ success: false, error: "bad_response" }));
    if (!data.success) {
      alert(`Failed to save: ${data.error || res.status}`);
    }
    loadProducts();
    return data;
  }

  async function setOrderStatus(id, status) {
    await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    loadOrders();
  }

  async function refundOrder(order) {
    const who = order.user_email || "the customer";
    if (
      !confirm(
        `Refund $${Number(order.total).toFixed(2)} to ${who}'s wallet balance and mark order #${order.order_number} as refunded?`
      )
    )
      return;
    const res = await fetch("/api/admin/refund-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id }),
    });
    const data = await res.json();
    alert(
      data.success
        ? `Refunded $${Number(data.refunded).toFixed(2)} to ${data.email || who}. New balance: $${Number(data.balance).toFixed(2)}.`
        : `Refund failed: ${
            {
              no_confirmed_payment: "no confirmed payment found for this order (nothing to return).",
              already_processed: "this order was already refunded.",
            }[data.error] || data.error
          }`
    );
    loadOrders();
  }

  async function deleteOrder(id) {
    if (!confirm("Permanently delete this order? This can't be undone.")) return;
    await fetch("/api/admin/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadOrders();
  }

  async function runDebug() {
    setDebugLoading(true);
    setDebugResult(null);
    const res = await fetch("/api/admin/debug-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hash: debugTx }),
    });
    const data = await res.json();
    setDebugResult(data);
    setDebugLoading(false);
  }

  const visibleProducts = useMemo(() => {
    let list = sortAvailableFirst
      ? [...products].sort((a, b) => b.available_stock - a.available_stock)
      : products;
    const q = productSearch.trim().toLowerCase();
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q));
    return list;
  }, [products, sortAvailableFirst, productSearch]);

  const visibleOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        (o.products?.title || "").toLowerCase().includes(q) ||
        (o.user_email || "").toLowerCase().includes(q) ||
        (o.email || "").toLowerCase().includes(q) ||
        (o.tx_hash || "").toLowerCase().includes(q) ||
        String(o.supplier_order_id || o.digitrust_order_id || "").toLowerCase().includes(q) ||
        String(o.id || "").toLowerCase().includes(q) ||
        JSON.stringify(o.items || "").toLowerCase().includes(q) ||
        String(o.order_number || "").includes(q) ||
        o.status.toLowerCase().includes(q)
    );
  }, [orders, orderSearch]);

  const pendingManualCount = useMemo(
    () => orders.filter((o) => o.status === "awaiting_manual_fulfillment").length,
    [orders]
  );

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <LoadingState label="Checking access…" />
      </div>
    );
  }
  if (!allowed)
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6">
        <p className="text-sm text-muted">This account doesn't have admin access.</p>
      </div>
    );

  return (
    <AdminLayout
      tab={tab}
      onTabChange={setTab}
      dashboard={dashboard}
      pendingManualCount={pendingManualCount}
    >
      {tab === "dashboard" && (
        <DashboardTab
          dashboard={dashboard}
          syncing={syncing}
          syncMessage={syncMessage}
          runManualSync={runManualSync}
          adjEmail={adjEmail}
          setAdjEmail={setAdjEmail}
          adjAmount={adjAmount}
          setAdjAmount={setAdjAmount}
          adjReason={adjReason}
          setAdjReason={setAdjReason}
          adjMessage={adjMessage}
          adjResult={adjResult}
          submitAdjustment={submitAdjustment}
        />
      )}

      {tab === "stats" && <StatsTab />}

      {tab === "deposits" && <DepositsTab />}

      {tab === "feedback" && <FeedbackTab />}

      {tab === "aitext" && <AiDescriptionsTab />}

      {tab === "support" && <SupportTab />}

      {tab === "coupons" && (
        <CouponsTab products={[...products, ...manualProducts]} />
      )}

      {tab === "products" && (
        <ProductsTab
          productSearch={productSearch}
          setProductSearch={setProductSearch}
          sortAvailableFirst={sortAvailableFirst}
          setSortAvailableFirst={setSortAvailableFirst}
          visibleProducts={visibleProducts}
          updateProduct={updateProduct}
          bulkUpdateProducts={bulkUpdateProducts}
        />
      )}

      {tab === "manual" && (
        <ManualProductsTab
          manualForm={manualForm}
          setManualForm={setManualForm}
          saveManualProduct={saveManualProduct}
          manualMessage={manualMessage}
          manualProducts={manualProducts}
          editManualProduct={editManualProduct}
          archiveManualProduct={archiveManualProduct}
          resetManualForm={() => setManualForm(emptyManualForm())}
          bulkUpdateManualProducts={bulkUpdateManualProducts}
          reloadManualProducts={loadManualProducts}
          boxesVersion={boxesVersion}
        />
      )}

      {tab === "suppliers" && <SuppliersTab onChanged={loadProducts} />}

      {tab === "orders" && (
        <OrdersTab
          orderSearch={orderSearch}
          setOrderSearch={setOrderSearch}
          digitrustOrders={digitrustOrders}
          setDigitrustOrders={setDigitrustOrders}
          visibleOrders={visibleOrders}
          setOrderStatus={setOrderStatus}
          deleteOrder={deleteOrder}
          onRefund={refundOrder}
          onDeliverManual={(order) => setDeliverOrder(order)}
          onCheckDigitrust={loadDigitrustOrders}
          onReconcileDelivered={(order) => setReconcileOrder(order)}
          onRetrySupplier={retrySupplierOrder}
        />
      )}

      {tab === "debug" && (
        <DebugTab
          debugTx={debugTx}
          setDebugTx={setDebugTx}
          runDebug={runDebug}
          debugLoading={debugLoading}
          debugResult={debugResult}
        />
      )}

      {tab === "settings" && (
        <SettingsTab
          whatsappLink={whatsappLink}
          channelType={channelType}
          setChannelType={setChannelType}
          setWhatsappLink={setWhatsappLink}
          saveSettings={saveSettings}
          settingsMessage={settingsMessage}
        />
      )}

      {deliverOrder && (
        <ManualDeliverModal
          order={deliverOrder}
          onClose={() => setDeliverOrder(null)}
          onDelivered={deliverManualOrder}
        />
      )}

      {reconcileOrder && (
        <ReconcileModal
          order={reconcileOrder}
          onClose={() => setReconcileOrder(null)}
          onResolved={() => {
            setReconcileOrder(null);
            loadOrders();
          }}
        />
      )}
    </AdminLayout>
  );
}
