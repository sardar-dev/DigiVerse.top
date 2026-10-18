import CopyButton from "../ui/CopyButton";
import { SITE_NAME, SITE_URL } from "../../lib/siteConfig";

const money = (n) => `$${Math.abs(Number(n)).toFixed(2)}`;

// Ready-to-send message for the customer after a manual wallet change.
export function buildBalanceMessage({ email, amount, balance }) {
  const credit = Number(amount) >= 0;
  return [
    credit ? "✅ Wallet topped up!" : "⚠️ Wallet adjusted",
    "",
    `👤 Account: ${email}`,
    credit ? `💰 Added: +${money(amount)}` : `➖ Deducted: -${money(amount)}`,
    `💼 New balance: ${money(balance)}`,
    "",
    `🛒 Shop now: ${SITE_URL}`,
    "🔐 Log in with the same email to use your balance.",
    "",
    `Thank you for choosing ${SITE_NAME}! 🙏`,
  ].join("\n");
}

export default function BalanceMessage({ result }) {
  if (!result) return null;
  const text = buildBalanceMessage(result);
  return (
    <div className="space-y-2 rounded-xl border border-success/30 bg-success-soft p-3">
      <div className="text-xs font-semibold text-success">
        Done — new balance {money(result.balance)}. Copy this message and send it to the user:
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface p-3 font-sans text-sm text-ink">{text}</pre>
      <CopyButton value={text} label="Copy message" />
    </div>
  );
}
