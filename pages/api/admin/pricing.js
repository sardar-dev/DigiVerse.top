import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { loadPricingRule, savePricingRule, computeSell, normalizeRule } from "../../../lib/pricing";
import { repriceAll } from "../../../lib/syncProducts";

export const config = { maxDuration: 60 };

// GET  -> current rule, counts, and a preview of what it would do
// POST { action: "save", rule } | { action: "apply" } | { action: "all_auto" }
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const rule = await loadPricingRule();
    const count = (apply) => {
      let q = supabaseAdmin.from("products").select("id", { count: "exact", head: true }).neq("provider", "manual");
      return apply ? apply(q) : q;
    };
    const [all, manual, sample] = await Promise.all([
      count(),
      count((q) => q.eq("auto_price", false)),
      supabaseAdmin
        .from("products")
        .select("id, title, cost_price, sell_price, selected")
        .neq("provider", "manual")
        .gt("cost_price", 0)
        .order("selected", { ascending: false })
        .order("title")
        .limit(8),
    ]);
    const migrated = !manual.error;
    return res.status(200).json({
      success: true,
      migrated,
      rule,
      total: all.count ?? 0,
      manual: manual.count ?? 0,
      sample: (sample.data || []).map((p) => ({
        id: p.id,
        title: p.title,
        cost: Number(p.cost_price),
        sell: Number(p.sell_price),
        next: computeSell(p.cost_price, normalizeRule({ ...rule, enabled: true })),
      })),
    });
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  const b = req.body || {};

  try {
    if (b.action === "save") {
      const rule = await savePricingRule(b.rule);
      return res.status(200).json({ success: true, rule });
    }
    if (b.action === "apply") {
      return res.status(200).json({ success: true, ...(await repriceAll()) });
    }
    if (b.action === "all_auto") {
      const { error } = await supabaseAdmin.from("products").update({ auto_price: true }).neq("provider", "manual");
      if (error) throw new Error(/auto_price/i.test(error.message) ? "run_migration_023" : error.message);
      return res.status(200).json({ success: true, ...(await repriceAll()) });
    }
    return res.status(400).json({ success: false, error: "unknown_action" });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
