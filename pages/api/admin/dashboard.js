import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { getBalance } from "../../../lib/digitrust";
import * as xpro from "../../../lib/suppliers/xpro";

const LOW_BALANCE_THRESHOLD = Number(process.env.LOW_BALANCE_THRESHOLD || 5);

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  let digitrustBalance = null;
  let digitrustBalanceError = null;
  try {
    const b = await getBalance();
    digitrustBalance = b.balance ?? b.wallet_balance ?? b;
  } catch (e) {
    digitrustBalanceError = e.message;
  }

  let xproInfo = null;
  if (xpro.configured()) {
    xproInfo = { balance: null, error: null, low: false };
    try {
      xproInfo.balance = (await xpro.getBalance()).balance;
      xproInfo.low = xproInfo.balance !== null && xproInfo.balance < LOW_BALANCE_THRESHOLD;
    } catch (e) {
      xproInfo.error = e.message;
    }
  }

  const { data: meta } = await supabaseAdmin
    .from("app_meta")
    .select("value")
    .eq("key", "last_sync")
    .maybeSingle();

  // Sales/profit summary. Cost is what each order's product cost us when it
  // was sold (orders.unit_cost, migration 015). If that column doesn't exist
  // yet, fall back to the product's current cost.
  let { data: delivered, error: deliveredErr } = await supabaseAdmin
    .from("orders")
    .select("total, quantity, product_id, unit_cost, products(cost_price)")
    .eq("status", "delivered");
  if (deliveredErr) {
    ({ data: delivered } = await supabaseAdmin
      .from("orders")
      .select("total, quantity, product_id, products(cost_price)")
      .eq("status", "delivered"));
  }

  let totalSales = 0;
  let totalCost = 0;
  for (const o of delivered || []) {
    totalSales += Number(o.total);
    totalCost += Number(o.unit_cost ?? o.products?.cost_price ?? 0) * o.quantity;
  }

  // Cheap head-count (no rows) for the Support tab badge; 0 if migration 019 isn't run yet.
  let openTickets = 0;
  try {
    const { count } = await supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    openTickets = count || 0;
  } catch {}

  return res.status(200).json({
    success: true,
    openTickets,
    digitrust: {
      balance: digitrustBalance,
      error: digitrustBalanceError,
      low: digitrustBalance !== null && digitrustBalance < LOW_BALANCE_THRESHOLD,
      threshold: LOW_BALANCE_THRESHOLD,
    },
    xpro: xproInfo,
    lastSync: meta?.value || null,
    sales: {
      ordersDelivered: (delivered || []).length,
      totalSales: Number(totalSales.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      profit: Number((totalSales - totalCost).toFixed(2)),
    },
  });
}
