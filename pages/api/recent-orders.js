import { supabaseAdmin } from "../../lib/supabaseAdmin";

// Public "recent purchases" feed. The table only ever holds the newest
// 15 rows (a DB trigger trims it) and stores a masked email, never the
// real one. Edge-cached so page views barely touch Supabase.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }
  const { data, error } = await supabaseAdmin
    .from("recent_orders")
    .select("id, product_title, quantity, email_masked, created_at")
    .order("id", { ascending: false })
    .limit(15);

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  // Table missing (migration not run yet) → just show nothing.
  if (error) return res.status(200).json({ success: true, orders: [] });
  return res.status(200).json({ success: true, orders: data || [] });
}
