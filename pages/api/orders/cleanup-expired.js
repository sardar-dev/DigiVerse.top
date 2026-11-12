import { cleanupExpiredPendingOrders } from "../../../lib/orderCleanup";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const purgedCount = await cleanupExpiredPendingOrders();
  return res.status(200).json({ success: true, purged: purgedCount });
}

