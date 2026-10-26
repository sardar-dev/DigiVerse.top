import { supabaseAdmin } from "./supabaseAdmin";

// Auto-pricing rule (Admin -> Pricing), kept in app_meta under key "pricing".
// sell price = cost + profit (percent or fixed), then rounded UP to the next
// $0.05 step. Never rounded down. There is NO minimum-profit floor here: the
// minimum is only checked when a coupon is applied (see lib/coupons.js).
export const PRICE_STEP = 0.05;
export const DEFAULT_RULE = { enabled: false, mode: "percent", value: 20, min_profit: 0 };

export function normalizeRule(r = {}) {
  const value = Number(r.value);
  return {
    enabled: Boolean(r.enabled),
    mode: r.mode === "fixed" ? "fixed" : "percent",
    value: Number.isFinite(value) ? Math.min(Math.max(value, 0), 10000) : DEFAULT_RULE.value,
    min_profit: 0, // kept for old saved rules; not used for pricing any more
  };
}

// Rounds UP to the next step (0.05, 0.10, 0.15 ...). Float-safe.
export function roundUpToStep(v, step = PRICE_STEP) {
  const units = Math.ceil(Math.round((v / step) * 1e6) / 1e6);
  return Math.round(units * step * 100) / 100;
}

// Price for one product. A per-product margin (auto_margin) wins over the
// global rule: cost + margin, still rounded up to the next 0.05.
export function computeSellFor(product, cost, rule) {
  const m = product?.auto_margin;
  if (m !== null && m !== undefined && m !== "" && Number.isFinite(Number(m))) {
    const c = Number(cost);
    if (!Number.isFinite(c) || c < 0) return null;
    return Math.max(PRICE_STEP, roundUpToStep(c + Number(m)));
  }
  return computeSell(cost, rule);
}

export function computeSell(cost, rule) {
  const c = Number(cost);
  if (!Number.isFinite(c) || c < 0) return null;
  const raw = rule.mode === "fixed" ? c + Number(rule.value) : c * (1 + Number(rule.value) / 100);
  return Math.max(PRICE_STEP, roundUpToStep(raw));
}

// Opt-in only: a product follows the rule ONLY when you ticked "Auto" on it
// (auto_price === true). Everything else keeps its own price. Manual
// products never follow the rule.
export const followsRule = (product, rule) =>
  rule.enabled && product.auto_price === true && product.provider !== "manual";

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
