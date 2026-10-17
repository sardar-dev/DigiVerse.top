import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { recomputeProduct } from "../../../lib/syncProducts";
import { retrySupplierOrder } from "../../../lib/fulfillOrder";
import { SUPPLIERS, enabledSuppliers } from "../../../lib/suppliers";

// Everything the admin "Suppliers" tab needs. Read on demand only (when
// the tab opens / Refresh is pressed) — never polled.

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    // Optional live check: supplier connection + wallet balance.
    if (req.query.check === "1") {
      const out = await Promise.all(
        Object.values(SUPPLIERS).map(async (s) => {
          if (!s.api.configured()) return { id: s.id, label: s.label, configured: false };
          try {
            const h = await s.api.health();
            const b = await s.api.getBalance();
            const catalog = s.api.probeCatalog ? await s.api.probeCatalog().catch((e) => ({ error: e.message })) : null;
            return { id: s.id, label: s.label, configured: true, ok: h.ok, balance: b.balance, catalog };
          } catch (e) {
            return { id: s.id, label: s.label, configured: true, ok: false, error: e.message };
          }
        })
      );
      return res.status(200).json({ success: true, suppliers: out });
    }

    const [{ data: products, error: pErr }, { data: sources, error: sErr }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, title, sell_price, selected, provider, active_supplier, supplier_status, requires_email, available_stock")
        .neq("provider", "manual"),
      supabaseAdmin
        .from("product_sources")
        .select("id, product_id, supplier, supplier_product_id, supplier_title, cost, stock, available_stock, approved"),
    ]);
    if (pErr || sErr) {
      return res.status(500).json({
        success: false,
        error: (pErr || sErr).message,
        hint: "Run supabase/migration_013_multi_supplier.sql first.",
      });
    }

    const srcByProduct = new Map();
    for (const s of sources) {
      if (!srcByProduct.has(s.product_id)) srcByProduct.set(s.product_id, []);
      srcByProduct.get(s.product_id).push(s);
    }

    // Unlinked supplier-only products ("stubs") + every DigiTrust product
    // they could be matched to. Scoring/search happens in the browser.
    const stubs = products.filter((p) => p.provider !== "digitrust");
    const targets = products.filter((p) => p.provider === "digitrust");
    const unlinked = stubs.map((p) => ({ product: p, source: (srcByProduct.get(p.id) || [])[0] || null }));

    // Products that have (or need) a supplier decision.
    const multi = products
      .filter((p) => p.provider === "digitrust" && (srcByProduct.get(p.id) || []).length > 1)
      .map((p) => ({ product: p, sources: srcByProduct.get(p.id) }));

    // DigiTrust-only products that are hidden because of price.
    const needsPrice = products
      .filter(
        (p) =>
          p.supplier_status === "price_too_high" &&
          !multi.some((m) => m.product.id === p.id) &&
          !stubs.some((s) => s.id === p.id)
      )
      .map((p) => ({ product: p, sources: srcByProduct.get(p.id) || [] }));

    return res.status(200).json({
      success: true,
      configured: enabledSuppliers().map((s) => ({ id: s.id, label: s.label })),
      unlinked,
      multi,
      needsPrice,
      linkTargets: targets
        .map((t) => ({
          id: t.id,
          title: t.title,
          sell_price: t.sell_price,
          available_stock: t.available_stock,
          requires_email: t.requires_email,
          supplier_status: t.supplier_status,
          sources: (srcByProduct.get(t.id) || []).map((s) => ({ supplier: s.supplier, cost: s.cost, stock: s.stock })),
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    });
  }

  if (req.method === "POST") {
    const { action } = req.body || {};

    if (action === "approve") {
      const { source_id, approved } = req.body;
      if (!source_id || typeof approved !== "boolean") {
        return res.status(400).json({ success: false, error: "invalid_request" });
      }
      const { data: src, error } = await supabaseAdmin
        .from("product_sources")
        .update({ approved })
        .eq("id", source_id)
        .select("product_id")
        .maybeSingle();
      if (error || !src) return res.status(500).json({ success: false, error: error?.message || "not_found" });
      await recomputeProduct(src.product_id);
      return res.status(200).json({ success: true });
    }

    if (action === "link") {
      const { stub_product_id, target_product_id } = req.body;
      if (!stub_product_id || !target_product_id || stub_product_id === target_product_id) {
        return res.status(400).json({ success: false, error: "invalid_request" });
      }
      const { data: rows } = await supabaseAdmin
        .from("products")
        .select("id, provider, requires_email")
        .in("id", [stub_product_id, target_product_id]);
      const stub = rows?.find((r) => r.id === stub_product_id);
      const target = rows?.find((r) => r.id === target_product_id);
      if (!stub || !target || stub.provider === "manual" || target.provider === "manual") {
        return res.status(400).json({ success: false, error: "invalid_products" });
      }
      if (stub.provider === "digitrust") {
        return res.status(400).json({ success: false, error: "digitrust_products_cant_be_merged" });
      }

      const { data: stubSources } = await supabaseAdmin
        .from("product_sources")
        .select("id, supplier")
        .eq("product_id", stub.id);
      if (!stubSources || stubSources.length === 0) {
        return res.status(400).json({ success: false, error: "stub_has_no_source" });
      }
      const { data: targetSources } = await supabaseAdmin
        .from("product_sources")
        .select("supplier")
        .eq("product_id", target.id);
      if (stubSources.some((s) => (targetSources || []).some((t) => t.supplier === s.supplier))) {
        return res.status(409).json({ success: false, error: "target_already_has_this_supplier" });
      }
      if (target.requires_email && stubSources.some((s) => SUPPLIERS[s.supplier]?.supportsEmail === false)) {
        return res.status(409).json({ success: false, error: "target_requires_email_supplier_cant_deliver" });
      }

      const { error: moveErr } = await supabaseAdmin
        .from("product_sources")
        .update({ product_id: target.id })
        .eq("product_id", stub.id);
      if (moveErr) return res.status(500).json({ success: false, error: moveErr.message });

      // Remove the now-empty stub if no order ever used it; otherwise
      // keep it hidden so order history stays intact.
      const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("product_id", stub.id);
      if (!count) {
        await supabaseAdmin.from("products").delete().eq("id", stub.id);
      } else {
        await supabaseAdmin
          .from("products")
          .update({ selected: false, available_stock: 0, supplier_status: "out_of_stock" })
          .eq("id", stub.id);
      }

      await recomputeProduct(target.id);
      return res.status(200).json({ success: true });
    }

    if (action === "unlink") {
      // Drops a secondary source; the next sync recreates it as a fresh
      // unlinked product so nothing is lost.
      const { source_id } = req.body;
      const { data: src } = await supabaseAdmin
        .from("product_sources")
        .select("id, product_id, supplier")
        .eq("id", source_id)
        .maybeSingle();
      if (!src) return res.status(404).json({ success: false, error: "not_found" });
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("provider")
        .eq("id", src.product_id)
        .maybeSingle();
      if (prod?.provider === src.supplier) {
        return res.status(400).json({ success: false, error: "cant_unlink_primary_source" });
      }
      await supabaseAdmin.from("product_sources").delete().eq("id", src.id);
      await recomputeProduct(src.product_id);
      return res.status(200).json({ success: true });
    }

    if (action === "retry_order") {
      const result = await retrySupplierOrder(req.body.order_id);
      return res.status(result.success ? 200 : 409).json(result);
    }

    return res.status(400).json({ success: false, error: "unknown_action" });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
