// Supplier registry. To add another store later: write
// lib/suppliers/<name>.js exposing the same functions as xpro.js and
// register it below — sync, checkout, fulfilment and the admin tab
// pick it up automatically.
import { supabaseAdmin } from "../supabaseAdmin";
import * as digitrust from "./digitrust";
import * as xpro from "./xpro";

export const SUPPLIERS = {
  digitrust: { id: "digitrust", label: "DigiTrust", supportsEmail: true, priority: 1, api: digitrust },
  xpro: { id: "xpro", label: "XPro", supportsEmail: false, priority: 2, api: xpro },
};

export const SUPPLIER_META = Object.fromEntries(
  Object.values(SUPPLIERS).map((s) => [s.id, { supportsEmail: s.supportsEmail, priority: s.priority }])
);

export const supplierLabel = (id) => SUPPLIERS[id]?.label || id || "—";

export const getSupplier = (id) => SUPPLIERS[id] || null;

export const enabledSuppliers = () => Object.values(SUPPLIERS).filter((s) => s.api.configured());

export const stockBuffer = () => Number(process.env.STOCK_BUFFER || 2);
export const applyBuffer = (stock) => Math.max(0, Number(stock || 0) - stockBuffer());

// Stub store-product ids for supplier products that have no twin yet:
// well above any DigiTrust id, never colliding with manual (negative).
export const STUB_ID_BASE = 1_000_000_000_000;
export const stubIdFor = (supplierProductId) => {
  const raw = String(supplierProductId);
  if (/^\d+$/.test(raw) && Number(raw) < 400_000_000_000) return STUB_ID_BASE + Number(raw);
  // Non-numeric supplier ids: stable 32-bit FNV-1a hash in its own range.
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return STUB_ID_BASE + 500_000_000_000 + h;
};

/**
 * Which supplier + supplier-side id serves this product right now?
 * Falls back to the pre-migration behaviour (DigiTrust, product id)
 * if product_sources doesn't exist yet.
 */
export async function resolveSource(product) {
  const supplier = product.active_supplier || "digitrust";
  const { data, error } = await supabaseAdmin
    .from("product_sources")
    .select("id, supplier_product_id, approved, cost")
    .eq("product_id", product.id)
    .eq("supplier", supplier)
    .maybeSingle();

  if (!error && data) {
    return { supplier, supplierProductId: data.supplier_product_id, approved: data.approved };
  }
  if (supplier === "digitrust") {
    return { supplier, supplierProductId: String(product.id), approved: false };
  }
  return null;
}
