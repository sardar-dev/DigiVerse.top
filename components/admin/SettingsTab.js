import { useState } from "react";
import { FormInput, FormSelect, FormTextarea } from "../ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import SectionHeading from "../ui/SectionHeading";

const PLACEHOLDER = {
  whatsapp: "https://chat.whatsapp.com/…",
  telegram: "https://t.me/yourchannel",
};

export default function SettingsTab({
  whatsappLink,
  setWhatsappLink,
  channelType,
  setChannelType,
  buyModalTicker,
  setBuyModalTicker,
  notice,
  setNotice,
  googleAuthEnabled,
  setGoogleAuthEnabled,
  telegramBotToken,
  setTelegramBotToken,
  telegramChatId,
  setTelegramChatId,
  telegramEnabled,
  setTelegramEnabled,
  saveSettings,
  settingsMessage,
}) {
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testTelegramResult, setTestTelegramResult] = useState("");

  async function sendTestTelegram() {
    setTestingTelegram(true);
    setTestTelegramResult("");
    try {
      const res = await fetch("/api/admin/telegram-test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestTelegramResult("✅ Test alert sent to Telegram! Check your bot.");
      } else {
        setTestTelegramResult(`❌ Error: ${data.error || "Failed"}`);
      }
    } catch (e) {
      setTestTelegramResult(`❌ Error: ${e.message}`);
    }
    setTestingTelegram(false);
  }
  return (
    <div className="max-w-md space-y-4">
      <SectionHeading title="Site settings" />

      {/* Community channel */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Community channel</p>
        <FormSelect
          label="Channel type"
          value={channelType}
          onChange={(e) => setChannelType(e.target.value)}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
        </FormSelect>
        <FormInput
          label={`${channelType === "telegram" ? "Telegram" : "WhatsApp"} channel link`}
          value={whatsappLink}
          onChange={(e) => setWhatsappLink(e.target.value)}
          placeholder={PLACEHOLDER[channelType]}
          hint="The selected channel's logo shows as a floating button on the storefront and customer pages. Leave empty to hide the button."
        />
      </div>

      {/* Buy modal ticker */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Buy modal ticker</p>
        <FormInput
          label="Scrolling notice text"
          value={buyModalTicker}
          onChange={(e) => setBuyModalTicker(e.target.value)}
          placeholder="e.g. ⚠️ Read product description before buying · Return policy: 24 hrs only"
          hint="This text scrolls across the top of the buy popup. Leave empty to hide the ticker."
        />
        {buyModalTicker && (
          <div className="overflow-hidden rounded-lg bg-brand">
            <div className="animate-marquee whitespace-nowrap py-1.5 text-xs font-semibold text-white">
              <span className="inline-block px-4">📢 {buyModalTicker}</span>
              <span className="inline-block px-4" aria-hidden="true">📢 {buyModalTicker}</span>
              <span className="inline-block px-4" aria-hidden="true">📢 {buyModalTicker}</span>
            </div>
          </div>
        )}
      </div>

      {/* Google OAuth Login & Sign-up */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Authentication</p>
            <p className="text-sm font-semibold text-ink mt-0.5">Google Sign-in & Sign-up</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(googleAuthEnabled)}
            aria-label="Toggle Google Sign-in"
            onClick={() => setGoogleAuthEnabled(!googleAuthEnabled)}
            className={`relative h-6 w-11 rounded-full transition ${googleAuthEnabled ? "bg-brand" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                googleAuthEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              googleAuthEnabled
                ? "bg-success-soft text-success border border-success/30"
                : "bg-surface-alt text-muted border border-border"
            }`}
          >
            {googleAuthEnabled ? "ENABLED (Live on Store)" : "DISABLED (Hidden from Users)"}
          </span>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Jab yeh <strong>DISABLED</strong> hoga to login aur signup pages par Continue with Google ka button chhupa rahega. Google Cloud Console credentials set karne ke baad aap ise yahan se <strong>ENABLED</strong> kar sakte hain.
        </p>
      </div>

      {/* Telegram Private Bot Notifications */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Instant Alerts</p>
            <p className="text-sm font-semibold text-ink mt-0.5">🤖 Private Telegram Bot</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(telegramEnabled)}
            aria-label="Toggle Telegram Alerts"
            onClick={() => setTelegramEnabled(!telegramEnabled)}
            className={`relative h-6 w-11 rounded-full transition ${telegramEnabled ? "bg-brand" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                telegramEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              telegramEnabled
                ? "bg-success-soft text-success border border-success/30"
                : "bg-surface-alt text-muted border border-border"
            }`}
          >
            {telegramEnabled ? "ACTIVE (Orders & Signups)" : "MUTED (Notifications Off)"}
          </span>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Har naye <strong>Order</strong> aur naye <strong>User Signup</strong> par aapke private Telegram bot se aapko foran instant alert aayega.
        </p>
        <FormInput
          label="Bot Token"
          value={telegramBotToken}
          onChange={(e) => setTelegramBotToken(e.target.value)}
          placeholder="e.g. 8959158776:AAGUUjn..."
        />
        <FormInput
          label="Your Telegram Chat ID"
          value={telegramChatId}
          onChange={(e) => setTelegramChatId(e.target.value)}
          placeholder="e.g. 1162040243"
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <SecondaryButton
            type="button"
            onClick={sendTestTelegram}
            disabled={testingTelegram || !telegramBotToken || !telegramChatId}
            className="text-xs py-2 px-3 min-h-9"
          >
            {testingTelegram ? "Sending..." : "🔔 Send Test Notification"}
          </SecondaryButton>
          {testTelegramResult && (
            <span className={`text-xs ${testTelegramResult.startsWith("✅") ? "text-success font-semibold" : "text-danger"}`}>
              {testTelegramResult}
            </span>
          )}
        </div>
      </div>

      {/* Notice popup */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Notice popup</p>
          <button
            type="button"
            role="switch"
            aria-checked={notice.enabled}
            aria-label="Show notice popup"
            onClick={() => setNotice({ ...notice, enabled: !notice.enabled })}
            className={`relative h-6 w-11 rounded-full transition ${notice.enabled ? "bg-brand" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                notice.enabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-muted">
          {notice.enabled ? "ON — visitors see this popup." : "OFF — popup is hidden."} Visitors can close it; it
          shows again only when you change the text.
        </p>
        <FormInput
          label="Title"
          value={notice.title}
          maxLength={120}
          onChange={(e) => setNotice({ ...notice, title: e.target.value })}
          placeholder="e.g. Important notice"
        />
        <FormTextarea
          label="Message"
          rows={4}
          value={notice.message}
          maxLength={1500}
          onChange={(e) => setNotice({ ...notice, message: e.target.value })}
          placeholder="Write the notice for your customers…"
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="Button text (optional)"
            value={notice.button_label}
            maxLength={40}
            onChange={(e) => setNotice({ ...notice, button_label: e.target.value })}
            placeholder="Learn more"
          />
          <FormInput
            label="Button link (optional)"
            value={notice.button_url}
            onChange={(e) => setNotice({ ...notice, button_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
      </div>

      <PrimaryButton onClick={saveSettings}>Save settings</PrimaryButton>
      {settingsMessage && <p className="text-sm text-muted">{settingsMessage}</p>}
    </div>
  );
}
