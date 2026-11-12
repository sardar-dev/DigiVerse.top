import { requireAdmin } from "../../../lib/requireAdmin";
import { sendTelegramMessage, getTelegramConfig } from "../../../lib/telegram";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { token } = await getTelegramConfig();
  let botUsername = "";
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (meData?.ok && meData.result?.username) {
      botUsername = meData.result.username;
    }
  } catch {}

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
    let err = result.error || "failed_to_send";
    if (/chat not found/i.test(err)) {
      const link = botUsername ? `https://t.me/${botUsername}` : "your bot";
      err = `Please open your Telegram bot and click START first: ${link}`;
    }
    return res.status(400).json({ success: false, error: err, bot_username: botUsername });
  }

  return res.status(200).json({ success: true, message: "Test notification sent successfully!" });
}

