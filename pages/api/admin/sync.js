import { syncProducts } from "../../../lib/syncProducts";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Called on a schedule (see vercel.json cron, or an external
// scheduler like cron-job.org on Hobby plans) to refresh our local
// product cache from DigiTrust.
export default async function handler(req, res) {
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>"
  // when a CRON_SECRET env var is set on the project. We also accept a
  // manual header/query value for external schedulers / testing.
  const bearer = (req.headers.authorization || "").replace("Bearer ", "");
  const secret = bearer || req.headers["x-cron-secret"] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  try {
    const result = await syncProducts();
    // Housekeeping: drop unpaid orders / expired invoices older than 3h
    // (migration 017). Best effort — never fails the sync.
    let purged = null;
    try {
      const { data } = await supabaseAdmin.rpc("purge_stale_pending");
      purged = data || null;
    } catch {}
    return res.status(200).json({ success: true, ...result, purged });
  } catch (e) {
    return res.status(502).json({ success: false, error: e.message });
  }
}
