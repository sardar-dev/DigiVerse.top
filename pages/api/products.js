import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
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
  // (no markup) instead of sell_price so they can verify pricing live.
  // We do a lightweight session+profile check here — no error thrown if
  // the user is not logged in or not admin, they just get regular prices.
  let isAdmin = false;
  try {
    const supabaseServer = createPagesServerClient({ req, res });
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (session) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();
      isAdmin = Boolean(profile?.is_admin);
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
    : data?.map(({ cost_price, ...p }) => p);

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
