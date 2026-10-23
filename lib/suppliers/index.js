// Supplier registry. To add another store later: write
// lib/suppliers/<name>.js exposing the same functions as xpro.js and
// register it below — sync, checkout, fulfilment and the admin tab
// pick it up automatically.
import { supabaseAdmin } from "../supabaseAdmin";
import * as digitrust from "./digitrust";
import * as xpro from "./xpro";
import { makeCustomApi } from "./custom";

export const SUPPLIERS = {
  digitrust: { id: "digitrust", label: "DigiTrust", supportsEmail: true, priority: 1, idempotent: false, api: digitrust },
  xpro: { id: "xpro", label: "XPro", supportsEmail: false, priority: 2, idempotent: true, api: xpro },
};

// Suppliers added from the admin panel (table custom_suppliers). Read from
// the database at most once a minute per server instance; built-in
// suppliers never touch the database here, so normal checkouts cost nothing.
let customCache = { at: 0, list: [] };
export const invalidateCustomSuppliers = () => {
  customCache = { at: 0, list: [] };
};
const toSupplier = (row, i) => {
  const cfg = row.config || {};
  return {
    id: row.id,
    label: row.label,
    supportsEmail: Boolean(cfg.supports_email),
    priority: 10 + i,
    idempotent: Boolean(cfg.idempotent_orders),
    custom: true,
    api: makeCustomApi(row),
  };
};
async function loadCustom() {
  if (Date.now() - customCache.at < 60_000) return customCache.list;
  const { data, error } = await supabaseAdmin
    .from("custom_suppliers")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  const list = error ? [] : (data || []).map(toSupplier);
  customCache = { at: Date.now(), list };
  return list;
}

export async function allSuppliers() {
  return [...Object.values(SUPPLIERS), ...(await loadCustom())];
}
export async function supplierMeta() {
  return Object.fromEntries(
    (await allSuppliers()).map((s) => [s.id, { supportsEmail: s.supportsEmail, priority: s.priority }])
  );
}
export const supplierLabel = (id) => SUPPLIERS[id]?.label || id || "—";
export async function supplierLabels() {
  return Object.fromEntries((await allSuppliers()).map((s) => [s.id, { label: s.label, idempotent: s.idempotent }]));
}

export async function getSupplier(id) {
  if (SUPPLIERS[id]) return SUPPLIERS[id];
  if (!id) return null;
  return (await loadCustom()).find((s) => s.id === id) || null;
}

export const enabledSuppliers = async () => (await allSuppliers()).filter((s) => s.api.configured());

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
