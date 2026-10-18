import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { recomputeProduct } from "../../../lib/syncProducts";
import { cleanTitle } from "../../../lib/cleanText";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return; // requireAdmin already sent the response

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .order("title", { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Attach each product's per-supplier numbers (one extra query) so the
    // admin sees BOTH suppliers for linked products, not just the active
    // one. Skipped quietly if migration 013 hasn't been run.
    const { data: sources, error: srcErr } = await supabaseAdmin
      .from("product_sources")
      .select("product_id, supplier, cost, stock, available_stock, approved");
    if (!srcErr && sources) {
      const byProduct = new Map();
      for (const s of sources) {
        if (!byProduct.has(s.product_id)) byProduct.set(s.product_id, []);
        byProduct.get(s.product_id).push(s);
      }
      for (const p of data) p.sources = byProduct.get(p.id) || [];
    }
    return res.status(200).json({ success: true, products: data });
  }

  if (req.method === "POST") {
    // Single-product update: { id, selected?, sell_price?, image_url?,
    // category?, featured?, low_stock_threshold?, short_description? }
    // Bulk update: { ids: [...], selected?, sell_price_delta_percent? }
    const { id, ids, title, selected, sell_price, image_url, category, featured, low_stock_threshold, short_description, sell_price_delta_percent } =
      req.body || {};

    if (Array.isArray(ids) && ids.length > 0) {
      // Bulk actions — deliberately narrow: show/hide, and a
      // percentage price adjustment (e.g. +5%). Never accepts an
      // absolute price in bulk, so one bad input can't zero out many
      // products' prices at once.
      if (typeof selected === "boolean") {
        const { error } = await supabaseAdmin
          .from("products")
          .update({ selected, updated_at: new Date().toISOString() })
          .in("id", ids);
        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, updated: ids.length });
      }
      if (sell_price_delta_percent !== undefined) {
        const pct = Number(sell_price_delta_percent);
        if (!Number.isFinite(pct) || pct <= -100) {
          return res.status(400).json({ success: false, error: "invalid_percent" });
        }
        // Read current prices first — Supabase has no "update column
        // = column * x" via the JS client, and this keeps it a
        // single bounded query either way (ids.length is admin-sized,
        // not customer-facing).
        const { data: rows, error: readErr } = await supabaseAdmin
          .from("products")
          .select("id, sell_price")
          .in("id", ids);
        if (readErr) return res.status(500).json({ success: false, error: readErr.message });

        const updates = rows.map((r) => ({
          id: r.id,
          sell_price: Math.max(0.01, Math.round(Number(r.sell_price) * (1 + pct / 100) * 100) / 100),
        }));
        for (const u of updates) {
          const { error } = await supabaseAdmin
            .from("products")
            .update({ sell_price: u.sell_price, updated_at: new Date().toISOString() })
            .eq("id", u.id);
          if (error) return res.status(500).json({ success: false, error: error.message });
          try {
            await recomputeProduct(u.id);
          } catch {}
        }
        return res.status(200).json({ success: true, updated: updates.length });
      }
      return res.status(400).json({ success: false, error: "no_bulk_action_specified" });
    }

    if (!id) return res.status(400).json({ success: false, error: "id_required" });

    const patch = { updated_at: new Date().toISOString() };
    if (typeof selected === "boolean") patch.selected = selected;
    if (typeof sell_price === "number") patch.sell_price = sell_price;
    if (image_url !== undefined) patch.image_url = image_url || null;
    if (category !== undefined) patch.category = category || null;
    if (typeof featured === "boolean") patch.featured = featured;
    if (low_stock_threshold !== undefined) {
      patch.low_stock_threshold =
        low_stock_threshold === null || low_stock_threshold === ""
          ? null
          : Math.max(0, Number(low_stock_threshold) || 0);
    }
    if (short_description !== undefined) patch.short_description = short_description || null;

    // Title: any product (manual or supplier) can be renamed. A custom
    // title is "locked" so the next sync never overwrites it. An empty
    // title unlocks it again (the supplier's title returns on next sync).
    let titleLockFields = {};
    if (typeof title === "string") {
      const clean = cleanTitle(title).slice(0, 200);
      if (clean) {
        patch.title = clean;
        titleLockFields = { title_locked: true };
      } else {
        titleLockFields = { title_locked: false };
      }
    }

    let { error } = await supabaseAdmin
      .from("products")
      .update({ ...patch, ...titleLockFields })
      .eq("id", id);
    if (error && /title_locked/i.test(error.message)) {
      // migration 014 not run yet: still save the new title itself.
      ({ error } = await supabaseAdmin.from("products").update(patch).eq("id", id));
    }
    if (error) return res.status(500).json({ success: false, error: error.message });
    // A new sell price can make a pricier supplier eligible (or not), so
    // re-decide the active source right away, from stored data only.
    if (patch.sell_price !== undefined) {
      try {
        await recomputeProduct(id);
      } catch {}
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
