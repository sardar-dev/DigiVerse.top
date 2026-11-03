import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { fetchStorefrontProducts } from "../../lib/storefrontProducts";

// Storefront reads from our local Supabase cache, never live from
// DigiTrust on every page view — that keeps us well under DigiTrust's
// 60 requests/minute limit no matter how much traffic we get. The
// cache is refreshed by /api/admin/sync (see cron setup in README).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // Check if the requester is an admin. Admins see supplier cost_price
  // alongside sell_price so they can verify margins live.
  // We read the access token from the cookie Supabase sets
  // (sb-<project>-auth-token) without using createPagesServerClient,
  // which modifies response headers and can conflict with caching.
  // If anything goes wrong we silently fall back to non-admin mode.
  let isAdmin = false;
  try {
    // Supabase stores the session as JSON in a cookie named
    // sb-<ref>-auth-token. Parse it to get the access_token.
    const cookieHeader = req.headers.cookie || "";
    const tokenMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
    if (tokenMatch) {
      const raw = decodeURIComponent(tokenMatch[1]);
      const parsed = JSON.parse(raw);
      const accessToken = Array.isArray(parsed) ? parsed[0] : parsed?.access_token;
      if (accessToken) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
        if (user) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("is_admin")
            .eq("id", user.id)
            .single();
          isAdmin = Boolean(profile?.is_admin);
        }
      }
    }
  } catch (_) {
    // Not critical — fall through to regular pricing
  }

  const { data, error } = await fetchStorefrontProducts();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  // Strip cost_price from non-admin responses so internal pricing
  // is never exposed to regular customers.
  const products = isAdmin
    ? data
    : data?.map(({ cost_price, min_order_qty, max_order_qty, ...p }) => ({ ...p, min_order_qty, max_order_qty }));

  // Admin responses must not be cached at the edge — they carry
  // cost_price which should never leak into a shared cache entry.
  if (isAdmin) {
    res.setHeader("Cache-Control", "private, no-store");
  } else {
    // Cache at Vercel's edge for 30s, serve stale for up to 2 more
    // minutes while revalidating in the background. Product stock only
    // changes on sync/admin edits, so this cuts most repeat Supabase
    // reads without customers ever seeing meaningfully stale data —
    // and checkout still re-checks live DigiTrust stock regardless.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=120"
    );
  }

  return res.status(200).json({ success: true, isAdmin, products });
}
