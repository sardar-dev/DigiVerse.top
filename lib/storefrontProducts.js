import { supabaseAdmin } from "./supabaseAdmin";

const BASE_COLUMNS =
  "id, title, description, short_description, image_url, category, featured, low_stock_threshold, sell_price, available_stock, requires_email, delivery, provider, activation_field, updated_at, is_out_of_stock, slug";

// Shared by the homepage and /api/products. Includes sold-out products. Includes `warranty` and
// `auto_delivery`, and quietly falls back to older column lists if a
// migration hasn't been run yet, so the storefront never breaks on a missing column.
export async function fetchStorefrontProducts() {
  const run = (cols) =>
    supabaseAdmin
      .from("products")
      .select(cols)
      .eq("selected", true)
      .order("featured", { ascending: false })
      .order("title", { ascending: true });

  // Newest column set first; fall back if a migration hasn't run yet.
  // ai_description (migration 018) is the admin-approved rewrite of the
  // supplier text; when set it replaces `description` for customers.
  // min_order_qty + max_order_qty added in migration_027.
  for (const extra of [
    ", delivery_badge, warranty, auto_delivery, ai_description, min_order_qty, max_order_qty, activation_placeholder, tunvn_buff",
    ", delivery_badge, warranty, auto_delivery, ai_description, min_order_qty, max_order_qty, activation_placeholder",
    ", warranty, auto_delivery, ai_description, min_order_qty, max_order_qty, activation_placeholder, tunvn_buff",
    ", warranty, auto_delivery, ai_description, min_order_qty, max_order_qty, activation_placeholder",
    ", warranty, auto_delivery, ai_description, min_order_qty, max_order_qty",
    ", warranty, auto_delivery, ai_description",
    ", warranty, auto_delivery",
    ", warranty",
    "",
  ]) {
    const result = await run(`${BASE_COLUMNS}${extra}`);
    if (!result.error) {
      if (result.data) {
        result.data = sortInStockFirst(
          result.data.map(({ ai_description, is_out_of_stock, available_stock, ...p }) => {
            const forcedOut = Boolean(is_out_of_stock);
            return {
              ...p,
              is_out_of_stock: forcedOut,
              available_stock: forcedOut ? 0 : available_stock,
              description: ai_description || p.description,
            };
          })
        );
      }
      return result;
    }
  }
  const last = await run(BASE_COLUMNS);
  if (last.data) last.data = sortInStockFirst(last.data);
  return last;
}

// Sold-out products stay on the storefront (shown as "Out of stock"), but
// available ones come first. Demo/Test product is always pinned to the very top.
function sortInStockFirst(list) {
  return [...list].sort((a, b) => {
    // 1. Demo / Test product always appears first
    const aDemo = a.id === -99 || a.category === "Demo / Testing 🧪";
    const bDemo = b.id === -99 || b.category === "Demo / Testing 🧪";
    if (aDemo && !bDemo) return -1;
    if (!aDemo && bDemo) return 1;

    // 2. In-stock products before out-of-stock
    return Number((b.available_stock || 0) > 0) - Number((a.available_stock || 0) > 0);
  });
}
