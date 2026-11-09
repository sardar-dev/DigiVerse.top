import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SEO from "../components/SEO";
import Alert from "../components/ui/Alert";
import { FormInput } from "../components/ui/FormInput";
import { PrimaryButton } from "../components/ui/Button";
import { useT } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function ResetPassword() {
  const { t, locale } = useT();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Supabase's client picks up the recovery session automatically
    // from the URL fragment the email link lands on.
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setDone(true);
  }

  if (done) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
        <SEO title={t("Reset password")} path="/reset-password" noindex />
      <div className="absolute end-4 top-4"><LanguageSwitcher /></div>
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 text-center shadow-card">
          <h1 className="text-2xl font-semibold text-ink">{t("Password updated")}</h1>
          <a href={locale === "en" ? "/login" : `/${locale}/login`} className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
            {t("Go to login")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
      <SEO title={t("Reset password")} path="/reset-password" noindex />
      <div className="absolute end-4 top-4"><LanguageSwitcher /></div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 shadow-card"
      >
        <h1 className="mb-5 text-2xl font-semibold text-ink">{t("Set a new password")}</h1>

        <div className="space-y-4">
          <div>
            <FormInput
              label={t("New password")}
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={t("At least 6 characters.")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="mt-1.5 text-xs font-medium text-brand hover:underline"
            >
              {showPassword ? t("Hide password") : t("Show password")}
            </button>
          </div>

          <Alert variant="error">{error}</Alert>

          <PrimaryButton disabled={loading} className="w-full">
            {loading ? t("Saving…") : t("Update password")}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
