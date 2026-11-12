import { requireAdmin } from "../../../lib/requireAdmin";
import { sendTelegramMessage } from "../../../lib/telegram";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const testMsg = [
    `🔔 <b>DigiVerse Telegram Alerts Connected!</b>`,
    ``,
    `✅ Your Telegram bot is actively connected to DigiVerse.top.`,
    `⚡ You will receive instant notifications here for:`,
    `  • 🛒 Every Order Paid (Product, Amount, Customer, Auto/Manual)`,
    `  • 👤 Every New User Signup (Email, Username, Referrer)`,
    ``,
    `⏱ <b>Test Time:</b> ${now}`,
  ].join("\n");

  const result = await sendTelegramMessage(testMsg);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error || "failed_to_send" });
  }

  return res.status(200).json({ success: true, message: "Test notification sent successfully!" });
}
