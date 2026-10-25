import { supabaseAdmin } from "./supabaseAdmin";

// Auto-pricing rule (Admin -> Pricing), kept in app_meta under key "pricing".
// sell price = cost + max(profit by rule, min_profit), rounded UP to a cent,
// so the margin is never below what was chosen.
export const DEFAULT_RULE = { enabled: false, mode: "percent", value: 20, min_profit: 0.1 };

export function normalizeRule(r = {}) {
  const value = Number(r.value);
  const min = Number(r.min_profit);
  return {
    enabled: Boolean(r.enabled),
    mode: r.mode === "fixed" ? "fixed" : "percent",
    value: Number.isFinite(value) ? Math.min(Math.max(value, 0), 10000) : DEFAULT_RULE.value,
    min_profit: Number.isFinite(min) ? Math.min(Math.max(min, 0), 1000) : DEFAULT_RULE.min_profit,
  };
}

export function computeSell(cost, rule) {
  const c = Number(cost);
  if (!Number.isFinite(c) || c < 0) return null;
  const profit = Math.max(rule.mode === "fixed" ? rule.value : (c * rule.value) / 100, rule.min_profit || 0);
  return Math.max(0.01, Math.ceil((c + profit) * 100 - 1e-6) / 100);
}

// Which products follow the rule: supplier products that have not been
// priced by hand. (Manual products keep their own price.)
export const followsRule = (product, rule) =>
  rule.enabled && product.auto_price !== false && product.provider !== "manual";

let memo = { at: 0, rule: null };
export const invalidatePricingRule = () => {
  memo = { at: 0, rule: null };
};

// One small read, remembered for a minute per server instance.
export async function loadPricingRule() {
  if (memo.rule && Date.now() - memo.at < 60_000) return memo.rule;
  let rule = { ...DEFAULT_RULE };
  try {
    const { data } = await supabaseAdmin.from("app_meta").select("value").eq("key", "pricing").maybeSingle();
    if (data?.value) rule = normalizeRule(JSON.parse(data.value));
  } catch {}
  memo = { at: Date.now(), rule };
  return rule;
}

export async function savePricingRule(raw) {
  const rule = normalizeRule(raw);
  const { error } = await supabaseAdmin
    .from("app_meta")
    .upsert({ key: "pricing", value: JSON.stringify(rule), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  invalidatePricingRule();
  return rule;
}
