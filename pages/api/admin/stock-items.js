import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";

const MAX_CONTENT = 5000;
const MAX_BATCH = 200;

// Splits pasted text into boxes: a line containing only --- separates
// one box from the next. One box with no separator = one box.
function splitBoxes(text) {
  return String(text || "")
    .split(/^\s*---+\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function resync(productId) {
  await supabaseAdmin.rpc("sync_auto_stock", { p_product_id: productId });
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const productId = Number(req.query.product_id);
    if (!Number.isFinite(productId)) {
      return res.status(400).json({ success: false, error: "product_id_required" });
    }
    const { data, error } = await supabaseAdmin
      .from("product_stock_items")
      .select("id, content, status, sold_at, created_at, orders(order_number)")
      .eq("product_id", productId)
      .order("seq", { ascending: true })
      .limit(1000);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, items: data || [] });
  }

  if (req.method === "POST") {
    const { product_id, content } = req.body || {};
    const productId = Number(product_id);
    const boxes = splitBoxes(content);
    if (!Number.isFinite(productId) || boxes.length === 0) {
      return res.status(400).json({ success: false, error: "content_required" });
    }
    if (boxes.length > MAX_BATCH) {
      return res.status(400).json({ success: false, error: "too_many_boxes" });
    }
    if (boxes.some((b) => b.length > MAX_CONTENT)) {
      return res.status(400).json({ success: false, error: "box_too_long" });
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, provider, auto_delivery")
      .eq("id", productId)
      .maybeSingle();
    if (!product || product.provider !== "manual" || !product.auto_delivery) {
      return res.status(400).json({ success: false, error: "not_an_auto_delivery_product" });
    }

    const { error } = await supabaseAdmin
      .from("product_stock_items")
      .insert(boxes.map((b) => ({ product_id: productId, content: b })));
    if (error) return res.status(500).json({ success: false, error: error.message });
    await resync(productId);
    return res.status(200).json({ success: true, added: boxes.length });
  }

  if (req.method === "PATCH") {
    const { id, content } = req.body || {};
    const text = String(content || "").trim();
    if (!id || !text || text.length > MAX_CONTENT) {
      return res.status(400).json({ success: false, error: "invalid_request" });
    }
    // Sold boxes are history — only unsold ones can be edited.
    const { data, error } = await supabaseAdmin
      .from("product_stock_items")
      .update({ content: text })
      .eq("id", id)
      .eq("status", "available")
      .select("id")
      .maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data) return res.status(409).json({ success: false, error: "box_already_sold" });
    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "invalid_request" });
    const { data, error } = await supabaseAdmin
      .from("product_stock_items")
      .delete()
      .eq("id", id)
      .eq("status", "available")
      .select("product_id")
      .maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data) return res.status(409).json({ success: false, error: "box_already_sold" });
    await resync(data.product_id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "method_not_allowed" });
}
