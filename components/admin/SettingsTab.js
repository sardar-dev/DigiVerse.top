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
  saveSettings,
  settingsMessage,
}) {
  return (
    <div className="max-w-md space-y-4">
      <SectionHeading title="Site settings" />
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card">
        <FormSelect
          label="Community channel"
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
        <PrimaryButton onClick={saveSettings}>Save</PrimaryButton>
        {settingsMessage && <p className="text-sm text-muted">{settingsMessage}</p>}
      </div>
    </div>
  );
}
