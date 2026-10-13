import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

// Manual products never call DigiTrust for anything (getProduct,
// purchase, stock/price sync) — they're entirely admin-managed rows
// in our own `products` table, distinguished by provider='manual'.
// IDs are always negative (via next_manual_product_id()) so they can
// never collide with a real DigiTrust product id.
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    // Reasonable limit — this is an admin tool, not a public listing.
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("provider", "manual")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, products: data });
  }

  if (req.method === "POST") {
    const {
      id, // omit to create a new product; pass to update an existing one
      ids, // bulk action instead — see below
      title,
      description,
      short_description, // short tagline shown on the storefront card
      image_url, // pasted link to an already-hosted logo/image
      category, // free-text tag, used for storefront filter tabs
      featured, // pin to show first on the storefront
      low_stock_threshold, // per-product "low stock" cutoff; null = default (3)
      sell_price,
      cost_price,
      available_stock,
      requires_email,
      delivery, // estimated delivery time text, e.g. "Within 1-6 hours"
      selected, // active/inactive
      activation_field, // null | 'email' | 'username' — what the customer must provide for activation
      auto_delivery, // true = customers get stored text "boxes" instantly after payment
      sell_price_delta_percent, // bulk-only: e.g. 5 for +5%
    } = req.body || {};

    if (Array.isArray(ids) && ids.length > 0) {
      // Bulk actions, scoped to manual products only (provider filter
      // below) so this can never accidentally touch a DigiTrust row.
      if (typeof selected === "boolean") {
        const { error } = await supabaseAdmin
          .from("products")
          .update({ selected, updated_at: new Date().toISOString() })
          .in("id", ids)
          .eq("provider", "manual");
        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, updated: ids.length });
      }
      if (sell_price_delta_percent !== undefined) {
        const pct = Number(sell_price_delta_percent);
        if (!Number.isFinite(pct) || pct <= -100) {
          return res.status(400).json({ success: false, error: "invalid_percent" });
        }
        const { data: rows, error: readErr } = await supabaseAdmin
          .from("products")
          .select("id, sell_price")
          .in("id", ids)
          .eq("provider", "manual");
        if (readErr) return res.status(500).json({ success: false, error: readErr.message });

        for (const r of rows) {
          const newPrice = Math.max(0.01, Math.round(Number(r.sell_price) * (1 + pct / 100) * 100) / 100);
          const { error } = await supabaseAdmin
            .from("products")
            .update({ sell_price: newPrice, updated_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("provider", "manual");
          if (error) return res.status(500).json({ success: false, error: error.message });
        }
        return res.status(200).json({ success: true, updated: rows.length });
      }
      return res.status(400).json({ success: false, error: "no_bulk_action_specified" });
    }

    const validActivation =
      activation_field === undefined ||
      activation_field === null ||
      activation_field === "" ||
      ["email", "username"].includes(activation_field);
    if (!validActivation) {
      return res.status(400).json({ success: false, error: "invalid_activation_field" });
    }
    const normalizedActivation = activation_field || null;

    // Never trust a price/stock from the client without validating
    // it server-side — these become real charges and real inventory.
    if (id === undefined) {
      // ── Create ──
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ success: false, error: "title_required" });
      }
      const sell = Number(sell_price);
      if (!Number.isFinite(sell) || sell <= 0) {
        return res.status(400).json({ success: false, error: "invalid_sell_price" });
      }
      const cost = cost_price === undefined ? 0 : Number(cost_price);
      if (!Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ success: false, error: "invalid_cost_price" });
      }
      // Auto-delivery products start with 0 stock; stock is then
      // always the number of unsold boxes.
      const stock = auto_delivery === true ? 0 : Number(available_stock);
      if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ success: false, error: "invalid_stock" });
      }

      const { data: newId, error: idErr } = await supabaseAdmin.rpc(
        "next_manual_product_id"
      );
      if (idErr) return res.status(500).json({ success: false, error: idErr.message });

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("products")
        .insert({
          id: newId,
          provider: "manual",
          title: title.trim(),
          description: description || null,
          sell_price: sell,
          cost_price: cost,
          real_stock: stock,
          available_stock: stock,
          requires_email: Boolean(requires_email) || normalizedActivation === "email",
          delivery: delivery || (auto_delivery === true ? "Instant" : "Within 24 hours"),
          // Only sent when on, so normal products work before migration_012.
          ...(auto_delivery === true ? { auto_delivery: true } : {}),
          selected: Boolean(selected),
          activation_field: normalizedActivation,
          short_description: short_description || null,
          image_url: image_url || null,
          category: category || null,
          featured: Boolean(featured),
          low_stock_threshold:
            low_stock_threshold === undefined || low_stock_threshold === null || low_stock_threshold === ""
              ? null
              : Math.max(0, Number(low_stock_threshold) || 0),
        })
        .select()
        .single();

      if (insertErr) return res.status(500).json({ success: false, error: insertErr.message });
      return res.status(200).json({ success: true, product: inserted });
    }

    // ── Update ──
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("provider", "manual")
      .maybeSingle();
    if (existingErr) return res.status(500).json({ success: false, error: existingErr.message });
    if (!existing) return res.status(404).json({ success: false, error: "product_not_found" });

    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ success: false, error: "title_required" });
      patch.title = title.trim();
    }
    if (description !== undefined) patch.description = description || null;
    if (sell_price !== undefined) {
      const sell = Number(sell_price);
      if (!Number.isFinite(sell) || sell <= 0) {
        return res.status(400).json({ success: false, error: "invalid_sell_price" });
      }
      patch.sell_price = sell;
    }
    if (cost_price !== undefined) {
      const cost = Number(cost_price);
      if (!Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ success: false, error: "invalid_cost_price" });
      }
      patch.cost_price = cost;
    }
    const wasAuto = existing.auto_delivery === true;
    const nowAuto = typeof auto_delivery === "boolean" ? auto_delivery : wasAuto;
    if (typeof auto_delivery === "boolean" && auto_delivery !== wasAuto) {
      patch.auto_delivery = auto_delivery;
    }
    // While auto-delivery is on, stock is computed from the boxes.
    if (available_stock !== undefined && !nowAuto) {
      const stock = Number(available_stock);
      if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ success: false, error: "invalid_stock" });
      }
      patch.available_stock = stock;
      patch.real_stock = stock;
    }
    if (requires_email !== undefined) patch.requires_email = Boolean(requires_email);
    if (delivery !== undefined) patch.delivery = delivery;
    if (selected !== undefined) patch.selected = Boolean(selected);
    if (activation_field !== undefined) {
      patch.activation_field = normalizedActivation;
      if (normalizedActivation === "email") patch.requires_email = true;
    }
    if (short_description !== undefined) patch.short_description = short_description || null;
    if (image_url !== undefined) patch.image_url = image_url || null;
    if (category !== undefined) patch.category = category || null;
    if (typeof featured === "boolean") patch.featured = featured;
    if (low_stock_threshold !== undefined) {
      patch.low_stock_threshold =
        low_stock_threshold === null || low_stock_threshold === ""
          ? null
          : Math.max(0, Number(low_stock_threshold) || 0);
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("provider", "manual")
      .select()
      .single();

    if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
    if (nowAuto && !wasAuto) {
      // Just switched on: stock becomes the count of existing boxes.
      await supabaseAdmin.rpc("sync_auto_stock", { p_product_id: id });
    }
    return res.status(200).json({ success: true, product: updated });
  }

  if (req.method === "DELETE") {
    // "Delete" always means archive (selected=false), never a real
    // row delete — existing orders reference this product id via a
    // foreign key, and a hard delete would break their order history.
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "id_required" });
    const { error } = await supabaseAdmin
      .from("products")
      .update({ selected: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("provider", "manual");
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
