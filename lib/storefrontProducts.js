import { supabaseAdmin } from "./supabaseAdmin";

const BASE_COLUMNS =
  "id, title, description, short_description, image_url, category, featured, low_stock_threshold, sell_price, available_stock, requires_email, delivery, provider, activation_field, updated_at";

// Shared by the homepage and /api/products. Includes `warranty`, and
// quietly falls back to the older column list if migration_011 hasn't
// been run yet, so the storefront never breaks on a missing column.
export async function fetchStorefrontProducts() {
  const run = (cols) =>
    supabaseAdmin
      .from("products")
      .select(cols)
      .eq("selected", true)
      .gt("available_stock", 0)
      .order("featured", { ascending: false })
      .order("title", { ascending: true });

  const first = await run(`${BASE_COLUMNS}, warranty`);
  if (!first.error) return first;
  return run(BASE_COLUMNS);
}
