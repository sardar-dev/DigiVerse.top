import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a plain-HTML email to the admin.
 * Returns silently on failure — email is best-effort, never blocks order flow.
 */
export async function sendAdminEmail({ subject, html }) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "orders@resend.dev";

  if (!process.env.RESEND_API_KEY || !adminEmail) {
    console.warn("[sendAdminEmail] RESEND_API_KEY or ADMIN_EMAIL not set — skipping email");
    return;
  }

  try {
    await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject,
      html,
    });
  } catch (err) {
    // Never crash the order flow over an email failure
    console.error("[sendAdminEmail] failed:", err?.message);
  }
}

/**
 * Notify admin that a manual-delivery order has been paid and is waiting.
 */
export async function notifyManualOrder({ order, productName, customerEmail }) {
  const orderId = String(order.id).slice(0, 8).toUpperCase();
  const placedAt = new Date(order.created_at || Date.now()).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const rows = [
    ["Order ID", `#${orderId}`],
    ["Product", productName || order.product_id],
    ["Quantity", order.quantity],
    ["Total", `$${order.total}`],
    ["Customer Email", customerEmail || "—"],
    ...(order.activation_info ? [["Customer Info", order.activation_info]] : []),
    ["Payment", order.paid_with === "wallet_balance" ? "Wallet Balance" : "USDT (on-chain)"],
    ["Placed At", placedAt],
  ];

  const tableRows = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;background:#f4f7ff;font-weight:600;color:#374151;white-space:nowrap;border-bottom:1px solid #e5e7eb;">${label}</td>
        <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${value}</td>
      </tr>`
    )
    .join("");

  const adminUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin`
    : "/admin";

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#3169F5;padding:20px 24px;">
        <h2 style="margin:0;color:#fff;font-size:18px;">📦 New Manual Order</h2>
        <p style="margin:4px 0 0;color:#c7d7fe;font-size:13px;">Delivery required — customer is waiting</p>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          ${tableRows}
        </table>
        <div style="margin-top:20px;text-align:center;">
          <a href="${adminUrl}" style="display:inline-block;padding:12px 28px;background:#3169F5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
            Open Admin Panel →
          </a>
        </div>
        <p style="margin-top:16px;color:#9ca3af;font-size:12px;text-align:center;">
          DigiPlanet · Auto-notification — do not reply to this email
        </p>
      </div>
    </div>
  `;

  await sendAdminEmail({
    subject: `📦 New Manual Order #${orderId} — ${productName || "Product"}`,
    html,
  });
}
