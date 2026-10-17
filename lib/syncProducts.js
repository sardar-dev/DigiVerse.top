import { supabaseAdmin } from "./supabaseAdmin";
import { getAllProducts, applyStockBuffer } from "./digitrust";
import { enabledSuppliers, applyBuffer, stubIdFor, SUPPLIER_META } from "./suppliers";
import { cleanTitle, stripTags } from "./cleanText";
import { chooseSource } from "./suppliers/choose";

// Refreshes our local product cache from DigiTrust: stock/price come
// in fresh, the stock buffer gets (re)applied, and a product is
// auto-unticked if DigiTrust raised its price since last sync (a
// price drop never auto-unhides anything — that stays an admin
// choice). Existing sell_price is preserved for products we already
// have; new products come in unselected with sell_price defaulted to
// DigiTrust's price.
// DigiTrust descriptions may contain HTML or entities; the storefront
// renders plain text, so flatten to readable text and cap the length.
function cleanDescription(raw) {
  if (typeof raw !== "string") return null;
  const text = stripTags(raw)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, 2000) : null;
}

// Warranty can arrive as text ("30 days") or a bare number (days).
function cleanWarranty(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw > 0 ? `${raw} day${raw === 1 ? "" : "s"}` : null;
  const text = cleanDescription(String(raw));
  if (!text) return null;
  return /^\d+$/.test(text) ? `${text} day${text === "1" ? "" : "s"}` : text.slice(0, 300);
}

// Pre-migration-013 behaviour (DigiTrust only). Used automatically if
// the product_sources table does not exist yet.
async function legacySync() {
  const remote = await getAllProducts();

  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id, sell_price, selected, cost_price");

  const existingById = new Map((existing || []).map((p) => [p.id, p]));

  const rows = remote.products.map((p) => {
    const buffered = applyStockBuffer(p);
    const current = existingById.get(p.id);
    const newCostPrice = p.special_price?.price ?? p.price;

    const priceIncreased =
      current && Number(newCostPrice) > Number(current.cost_price);
    const selected = current ? (priceIncreased ? false : current.selected) : false;

    // Only overwrite when DigiTrust actually sent a description, so a
    // missing/empty field in one sync never wipes a stored one.
    const description = cleanDescription(p.description ?? p.details);

    const warranty = cleanWarranty(
      p.warranty ?? p.warranty_period ?? p.warranty_days ?? p.guarantee
    );

    return {
      id: p.id,
      title: cleanTitle(p.title),
      ...(description ? { description } : {}),
      ...(warranty ? { warranty } : {}),
      cost_price: newCostPrice,
      sell_price: current ? current.sell_price : newCostPrice,
      real_stock: buffered.real_stock,
      available_stock: buffered.available_stock,
      requires_email: p.requires_email,
      delivery: p.delivery,
      selected,
      updated_at: new Date().toISOString(),
    };
  });

  let { error } = await supabaseAdmin.from("products").upsert(rows);
  if (error && /warranty/i.test(error.message)) {
    // migration_011 (warranty column) not run yet — sync everything
    // else rather than failing the whole sync.
    ({ error } = await supabaseAdmin
      .from("products")
      .upsert(rows.map(({ warranty, ...rest }) => rest)));
  }
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("app_meta")
    .upsert({ key: "last_sync", value: new Date().toISOString() });

  return {
    synced: rows.length,
    withDescription: rows.filter((r) => r.description).length,
    withWarranty: rows.filter((r) => r.warranty).length,
  };
}


const same = (a, b) => (a ?? null) === (b ?? null);

// Multi-supplier sync. One request per supplier catalog, two reads
// (products + sources) and at most two bulk writes — and only rows
// that actually changed are written, which keeps Supabase usage tiny.
export async function syncProducts() {
  const probe = await supabaseAdmin.from("product_sources").select("id").limit(1);
  if (probe.error) return legacySync();

  const suppliers = enabledSuppliers();
  if (suppliers.length === 0) throw new Error("No supplier API is configured");

  // 1) Fetch every supplier catalog in parallel. A supplier that fails
  // keeps its previous data (never wiped); it's reported to the admin.
  const settled = await Promise.allSettled(suppliers.map((s) => s.api.listProducts()));
  const catalogs = {};
  const report = {};
  settled.forEach((r, i) => {
    const id = suppliers[i].id;
    if (r.status === "fulfilled") {
      catalogs[id] = r.value;
      report[id] = { ok: true, count: r.value.length, ...(r.value.meta?.hint ? { hint: r.value.meta.hint } : {}) };
    } else {
      report[id] = { ok: false, error: r.reason?.message || "failed" };
    }
  });
  if (Object.keys(catalogs).length === 0) {
    throw new Error(
      Object.entries(report).map(([k, v]) => `${k}: ${v.error}`).join("; ") || "all suppliers failed"
    );
  }

  // 2) Current state
  const PRODUCT_COLS =
    "id, title, description, warranty, category, sell_price, selected, cost_price, real_stock, available_stock, requires_email, delivery, provider, active_supplier, supplier_status";
  // title_locked (migration 014) marks titles the admin edited by hand;
  // fall back quietly if that migration has not been run yet.
  const readProducts = async () => {
    const r = await supabaseAdmin.from("products").select(`${PRODUCT_COLS}, title_locked`).neq("provider", "manual");
    if (r.error && /title_locked/i.test(r.error.message)) {
      return supabaseAdmin.from("products").select(PRODUCT_COLS).neq("provider", "manual");
    }
    return r;
  };
  const [{ data: products, error: pErr }, { data: sources, error: sErr }] = await Promise.all([
    readProducts(),
    supabaseAdmin
      .from("product_sources")
      .select("id, product_id, supplier, supplier_product_id, supplier_title, cost, stock, available_stock, approved"),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (sErr) throw new Error(sErr.message);

  const productById = new Map(products.map((p) => [p.id, p]));
  const sourceByKey = new Map(sources.map((s) => [`${s.supplier}:${s.supplier_product_id}`, s]));
  const now = new Date().toISOString();

  // 3) Merge catalogs into the in-memory source list
  const newProducts = new Map(); // id -> row for brand-new store products
  const sourceWrites = new Map(); // key -> row to upsert
  const seenKeys = new Set();

  for (const [supplierId, list] of Object.entries(catalogs)) {
    for (const rp of list) {
      const key = `${supplierId}:${rp.supplierProductId}`;
      seenKeys.add(key);
      const existing = sourceByKey.get(key);
      const availableStock = applyBuffer(rp.stock);

      let productId = existing?.product_id;
      if (!productId) {
        productId = supplierId === "digitrust" ? Number(rp.supplierProductId) : stubIdFor(rp.supplierProductId);
        if (!productById.has(productId) && !newProducts.has(productId)) {
          newProducts.set(productId, {
            id: productId,
            title: rp.title,
            description: cleanDescription(rp.description),
            warranty: cleanWarranty(rp.warranty),
            category: rp.category || null,
            sell_price: rp.cost,
            selected: false,
            cost_price: rp.cost,
            real_stock: rp.stock,
            available_stock: availableStock,
            requires_email: rp.requiresEmail,
            delivery: rp.delivery,
            provider: supplierId,
            active_supplier: supplierId,
            supplier_status: "ok",
          });
        }
      }

      const changed =
        !existing ||
        Number(existing.cost) !== rp.cost ||
        existing.stock !== rp.stock ||
        existing.available_stock !== availableStock ||
        !same(existing.supplier_title, rp.title);

      const merged = {
        ...(existing || {}),
        product_id: productId,
        supplier: supplierId,
        supplier_product_id: rp.supplierProductId,
        supplier_title: rp.title,
        cost: rp.cost,
        stock: rp.stock,
        available_stock: availableStock,
        approved: existing?.approved || false,
      };
      sourceByKey.set(key, merged);
      if (changed) {
        sourceWrites.set(key, {
          product_id: productId,
          supplier: supplierId,
          supplier_product_id: rp.supplierProductId,
          supplier_title: rp.title,
          cost: rp.cost,
          stock: rp.stock,
          available_stock: availableStock,
          updated_at: now,
        });
      }
    }
  }

  // Sources that vanished from a supplier catalog we did fetch = out of stock.
  for (const [key, s] of sourceByKey) {
    if (seenKeys.has(key) || !catalogs[s.supplier]) continue;
    if (s.stock !== 0 || s.available_stock !== 0) {
      const gone = { ...s, stock: 0, available_stock: 0 };
      sourceByKey.set(key, gone);
      sourceWrites.set(key, {
        product_id: s.product_id,
        supplier: s.supplier,
        supplier_product_id: s.supplier_product_id,
        supplier_title: s.supplier_title,
        cost: s.cost,
        stock: 0,
        available_stock: 0,
        updated_at: now,
      });
    }
  }

  // 4) Group sources per product and decide the active one
  const byProduct = new Map();
  for (const s of sourceByKey.values()) {
    if (!byProduct.has(s.product_id)) byProduct.set(s.product_id, []);
    byProduct.get(s.product_id).push(s);
  }

  // Canonical text comes from DigiTrust for DigiTrust-origin products,
  // and from the supplier itself for supplier-only (stub) products.
  const textFor = new Map();
  for (const [supplierId, list] of Object.entries(catalogs)) {
    for (const rp of list) {
      const src = sourceByKey.get(`${supplierId}:${rp.supplierProductId}`);
      const prod = productById.get(src.product_id) || newProducts.get(src.product_id);
      if (prod && prod.provider === supplierId) textFor.set(prod.id, rp);
    }
  }

  const productWrites = [];
  const statusCount = { ok: 0, out_of_stock: 0, price_too_high: 0 };
  const allIds = new Set([...productById.keys(), ...newProducts.keys()]);

  for (const id of allIds) {
    const base = productById.get(id) || newProducts.get(id);
    const isNew = !productById.has(id);
    const list = byProduct.get(id) || [];
    const choice = chooseSource(base, list, SUPPLIER_META);
    statusCount[choice.status]++;

    const rp = textFor.get(id);
    const description = rp ? cleanDescription(rp.description) || base.description : base.description;
    const warranty = rp ? cleanWarranty(rp.warranty) || base.warranty : base.warranty;
    const title = base.title_locked ? base.title : rp ? rp.title : cleanTitle(base.title);
    const requiresEmail = rp ? rp.requiresEmail : base.requires_email;
    const delivery = rp ? rp.delivery : base.delivery;

    const next = {
      id,
      title,
      description: description ?? null,
      warranty: warranty ?? null,
      category: base.category ?? null,
      sell_price: base.sell_price,
      selected: base.selected,
      cost_price: choice.mirror.cost_price,
      real_stock: choice.mirror.real_stock,
      available_stock: choice.mirror.available_stock,
      requires_email: requiresEmail,
      delivery,
      provider: base.provider,
      active_supplier: choice.mirror.active_supplier,
      supplier_status: choice.mirror.supplier_status,
    };

    const dirty =
      isNew ||
      !same(base.title, next.title) ||
      !same(base.description, next.description) ||
      !same(base.warranty, next.warranty) ||
      Number(base.cost_price) !== Number(next.cost_price) ||
      base.real_stock !== next.real_stock ||
      base.available_stock !== next.available_stock ||
      base.requires_email !== next.requires_email ||
      !same(base.delivery, next.delivery) ||
      base.active_supplier !== next.active_supplier ||
      base.supplier_status !== next.supplier_status;

    if (dirty) productWrites.push({ ...next, updated_at: now });
  }

  // 5) Write: products first (sources reference them), then sources
  if (productWrites.length > 0) {
    const { error } = await supabaseAdmin.from("products").upsert(productWrites);
    if (error) throw new Error(error.message);
  }
  if (sourceWrites.size > 0) {
    const { error } = await supabaseAdmin
      .from("product_sources")
      .upsert([...sourceWrites.values()], { onConflict: "supplier,supplier_product_id" });
    if (error) throw new Error(error.message);
  }

  await supabaseAdmin.from("app_meta").upsert({ key: "last_sync", value: now });

  const catalogTotal = Object.values(catalogs).reduce((n, l) => n + l.length, 0);
  return {
    synced: catalogTotal,
    updated: productWrites.length,
    newProducts: newProducts.size,
    suppliers: report,
    status: statusCount,
    withDescription: productWrites.filter((r) => r.description).length,
    withWarranty: productWrites.filter((r) => r.warranty).length,
  };
}

// Re-decides the active supplier for ONE product from stored data (no
// supplier API call). Used right after an admin changes a price,
// approves a source or links products, so the change is instant.
export async function recomputeProduct(productId) {
  const [{ data: product }, { data: sources }] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, sell_price, requires_email, active_supplier, cost_price, provider")
      .eq("id", productId)
      .maybeSingle(),
    supabaseAdmin
      .from("product_sources")
      .select("supplier, cost, stock, available_stock, approved")
      .eq("product_id", productId),
  ]);
  if (!product || product.provider === "manual") return null;
  if (!sources || sources.length === 0) return null; // nothing to decide from
  const choice = chooseSource(product, sources || [], SUPPLIER_META);
  const { error } = await supabaseAdmin
    .from("products")
    .update({ ...choice.mirror, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(error.message);
  return choice;
}

// Self-healing: when a live supplier check (at checkout) disagrees with
// what we have stored, write the fresh numbers back and re-decide the
// product right away. So a sold-out or repriced source is hidden on the
// first failed attempt instead of waiting for the next scheduled sync.
// Only called on a mismatch, so it costs nothing in the normal case.
export async function refreshSourceFromLive(productId, supplier, live) {
  const { error } = await supabaseAdmin
    .from("product_sources")
    .update({
      cost: live.cost,
      stock: live.stock,
      available_stock: applyBuffer(live.stock),
      updated_at: new Date().toISOString(),
    })
    .eq("product_id", productId)
    .eq("supplier", supplier);
  if (error) return null;
  return recomputeProduct(productId);
}
