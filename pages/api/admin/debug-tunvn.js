import { requireAdmin } from "../../../lib/requireAdmin";

const BASE = "https://tunvnmmo.duckdns.org";

// Admin-only: test TunVN API connectivity and see raw responses.
// POST { action: "balance" }         → raw balance response
// POST { action: "products" }        → first 3 products raw
// POST { action: "buy_dry", product_id, quantity } → shows what buy would send (no actual purchase)
// POST { action: "order_detail", order_id } → raw order record from TunVN
export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const key = process.env.TUNVN_API_KEY;
  if (!key) {
    return res.status(400).json({ success: false, error: "TUNVN_API_KEY is not set in environment variables" });
  }

  const headers = { "X-API-Key": key, Accept: "application/json" };
  const { action, product_id, quantity, order_id } = req.body || {};

  try {
    if (action === "balance") {
      const r = await fetch(`${BASE}/api/balance`, { headers, signal: AbortSignal.timeout(8000) });
      const data = await r.json().catch(() => null);
      return res.status(200).json({ success: true, http_status: r.status, data });
    }

    if (action === "products") {
      const r = await fetch(`${BASE}/api/products`, { headers, signal: AbortSignal.timeout(8000) });
      const data = await r.json().catch(() => null);
      const preview = Array.isArray(data) ? data.slice(0, 3)
        : Array.isArray(data?.products) ? data.products.slice(0, 3)
        : Array.isArray(data?.items) ? data.items.slice(0, 3)
        : data;
      return res.status(200).json({ success: true, http_status: r.status, preview, raw_keys: data && typeof data === "object" ? Object.keys(data) : null });
    }

    if (action === "buy_dry") {
      if (!product_id) return res.status(400).json({ success: false, error: "product_id required" });
      const pid = Number.isFinite(Number(product_id)) ? Number(product_id) : String(product_id);
      return res.status(200).json({
        success: true,
        note: "This is a DRY RUN — no actual purchase made",
        would_send: { product_id: pid, quantity: Number(quantity || 1) },
        endpoint: `POST ${BASE}/api/buy`,
        api_key_set: true,
      });
    }

    if (action === "order_detail") {
      if (!order_id) return res.status(400).json({ success: false, error: "order_id required" });
      const r = await fetch(`${BASE}/api/orders/${encodeURIComponent(order_id)}`, { headers, signal: AbortSignal.timeout(8000) });
      const data = await r.json().catch(() => null);
      return res.status(200).json({ success: true, http_status: r.status, data });
    }

    if (action === "buff_check") {
      const { code = "TEST", qty = 1 } = req.body || {};
      const r = await fetch(`${BASE}/api/buff/check`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ orders_text: `${code} ${qty}` }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json().catch(() => null);
      return res.status(200).json({ success: true, http_status: r.status, data });
    }

    return res.status(400).json({ success: false, error: "unknown action. Use: balance, products, buy_dry, order_detail, buff_check" });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

