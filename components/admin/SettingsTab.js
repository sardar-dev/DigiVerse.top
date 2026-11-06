import { FormInput, FormSelect } from "../ui/FormInput";
import { PrimaryButton } from "../ui/Button";
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
  saveSettings,
  settingsMessage,
}) {
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
          <div className="overflow-hidden rounded-lg bg-amber-50 dark:bg-amber-900/20">
            <div className="animate-marquee whitespace-nowrap py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {buyModalTicker}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{buyModalTicker}
            </div>
          </div>
        )}
      </div>

      <PrimaryButton onClick={saveSettings}>Save settings</PrimaryButton>
      {settingsMessage && <p className="text-sm text-muted">{settingsMessage}</p>}
    </div>
  );
}
