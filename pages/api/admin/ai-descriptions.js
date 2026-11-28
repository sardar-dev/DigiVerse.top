import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { rewriteDescription, aiConfigured } from "../../../lib/aiRewrite";

export const config = { maxDuration: 30 };

// GET  → products with their original + saved AI description
// POST { action: "generate", id } → draft only (nothing is saved)
// POST { action: "save", id, text } → saves a reviewed description
// POST { action: "reset", id }     → back to the supplier's original
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    let r = await supabaseAdmin
      .from("products")
      .select("id, title, description, ai_description, selected, provider")
      .order("title", { ascending: true })
      .limit(1000);
    let migrated = true;
    if (r.error) {
      migrated = false; // ai_description column not there yet
      r = await supabaseAdmin
        .from("products")
        .select("id, title, description, selected, provider")
        .order("title", { ascending: true })
        .limit(1000);
    }
    if (r.error) return res.status(500).json({ success: false, error: r.error.message });
    return res.status(200).json({
      success: true,
      migrated,
      configured: aiConfigured(),
      products: r.data || [],
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { action, id, text, title, description } = req.body || {};
  if (!["generate", "save", "reset"].includes(action) || (action !== "generate" && !id)) {
    return res.status(400).json({ success: false, error: "invalid_request" });
  }

  if (action === "generate") {
    let srcTitle = typeof title === "string" ? title.trim() : "";
    let srcDesc = typeof description === "string" ? description.trim() : "";
    if (!srcDesc && id) {
      const { data: p } = await supabaseAdmin
        .from("products")
        .select("title, description")
        .eq("id", id)
        .maybeSingle();
      if (!p) return res.status(404).json({ success: false, error: "product_not_found" });
      srcTitle = srcTitle || p.title;
      srcDesc = p.description || "";
    }
    if (!srcTitle && !srcDesc) {
      return res.status(200).json({ success: false, error: "no_description" });
    }
    const out = await rewriteDescription({ title: srcTitle, description: srcDesc || srcTitle });
    if (!out.ok) return res.status(200).json({ success: false, error: out.error, detail: out.detail || null });
    return res.status(200).json({ success: true, draft: out.text });
  }

  const value =
    action === "reset" ? null : String(text || "").trim().slice(0, 4000) || null;
  const { error } = await supabaseAdmin
    .from("products")
    .update({ ai_description: value })
    .eq("id", id);
  if (error) {
    return res.status(500).json({
      success: false,
      error: /ai_description/.test(error.message || "") ? "run_migration_018" : error.message,
    });
  }
  return res.status(200).json({ success: true });
}
