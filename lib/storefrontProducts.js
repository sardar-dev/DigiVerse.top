import { supabaseAdmin } from "./supabaseAdmin";

const BASE_COLUMNS =
  "id, title, description, short_description, image_url, category, featured, low_stock_threshold, sell_price, available_stock, requires_email, delivery, provider, activation_field, updated_at";

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
  for (const extra of [", warranty, auto_delivery, ai_description", ", warranty, auto_delivery", ", warranty", ""]) {
    const result = await run(`${BASE_COLUMNS}${extra}`);
    if (!result.error) {
      if (result.data) {
        result.data = sortInStockFirst(
          result.data.map(({ ai_description, ...p }) =>
            ai_description ? { ...p, description: ai_description } : p
          )
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
// available ones come first. Array.sort is stable, so the featured/title
// order from the query is kept inside each group.
function sortInStockFirst(list) {
  return [...list].sort(
    (a, b) => Number((b.available_stock || 0) > 0) - Number((a.available_stock || 0) > 0)
  );
}
