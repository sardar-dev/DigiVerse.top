import { fetchStorefrontProducts } from "../../lib/storefrontProducts";


// Storefront reads from our local Supabase cache, never live from
// DigiTrust on every page view — that keeps us well under DigiTrust's
// 60 requests/minute limit no matter how much traffic we get. The
// cache is refreshed by /api/admin/sync (see cron setup in README).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { data, error } = await fetchStorefrontProducts();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  // Cache at Vercel's edge for 30s, serve stale for up to 2 more
  // minutes while revalidating in the background. Product stock only
  // changes on sync/admin edits, so this cuts most repeat Supabase
  // reads without customers ever seeing meaningfully stale data —
  // and checkout still re-checks live DigiTrust stock regardless.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=30, stale-while-revalidate=120"
  );

  return res.status(200).json({ success: true, products: data });
}
