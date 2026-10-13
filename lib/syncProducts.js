import { supabaseAdmin } from "./supabaseAdmin";
import { getAllProducts, applyStockBuffer } from "./digitrust";

// Refreshes our local product cache from DigiTrust: stock/price come
// in fresh, the stock buffer gets (re)applied, and a product is
// auto-unticked if DigiTrust raised its price since last sync (a
// price drop never auto-unhides anything — that stays an admin
// choice). Existing sell_price is preserved for products we already
// have; new products come in unselected with sell_price defaulted to
// DigiTrust's price.
// DigiTrust descriptions may contain HTML or entities; the storefront
// renders plain text, so flatten to readable text and cap the length.
function cleanDescription(raw) {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, 2000) : null;
}

export async function syncProducts() {
  const remote = await getAllProducts();

  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id, sell_price, selected, cost_price");

  const existingById = new Map((existing || []).map((p) => [p.id, p]));

  const rows = remote.products.map((p) => {
    const buffered = applyStockBuffer(p);
    const current = existingById.get(p.id);
    const newCostPrice = p.special_price?.price ?? p.price;

    const priceIncreased =
      current && Number(newCostPrice) > Number(current.cost_price);
    const selected = current ? (priceIncreased ? false : current.selected) : false;

    // Only overwrite when DigiTrust actually sent a description, so a
    // missing/empty field in one sync never wipes a stored one.
    const description = cleanDescription(p.description ?? p.details);

    return {
      id: p.id,
      title: p.title,
      ...(description ? { description } : {}),
      cost_price: newCostPrice,
      sell_price: current ? current.sell_price : newCostPrice,
      real_stock: buffered.real_stock,
      available_stock: buffered.available_stock,
      requires_email: p.requires_email,
      delivery: p.delivery,
      selected,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabaseAdmin.from("products").upsert(rows);
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("app_meta")
    .upsert({ key: "last_sync", value: new Date().toISOString() });

  return {
    synced: rows.length,
    withDescription: rows.filter((r) => r.description).length,
  };
}
