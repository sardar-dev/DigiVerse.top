import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import SEO from "../components/SEO";
import Alert from "../components/ui/Alert";
import { FormInput } from "../components/ui/FormInput";
import { PrimaryButton, LinkButton } from "../components/ui/Button";
import { SITE_NAME } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const { t, locale } = useT();
  const home = locale === "en" ? "/" : `/${locale}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    window.location.href = home;
  }

  async function forgotPassword() {
    if (!email) {
      setError(t('Type your email above first, then tap "Forgot password".'));
      return;
    }
    setError("");
    setNotice("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });
    if (error) return setError(error.message);
    setNotice(t("If that email has an account, a password reset link is on its way."));
  }

  async function resendConfirmation() {
    if (!email) {
      setError(t('Type your email above first, then tap "Resend confirmation email".'));
      return;
    }
    setError("");
    setNotice("");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) return setError(error.message);
    setNotice(t("Confirmation email resent — check your inbox."));
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
      <SEO title={t("Log in")} path="/login" noindex />
      <div className="absolute end-4 top-4"><LanguageSwitcher /></div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 shadow-card"
      >
        <Link href="/" className="mb-1 block text-base font-semibold text-ink">
          {SITE_NAME}
        </Link>
        <h1 className="mb-5 text-2xl font-semibold text-ink">{t("Log in")}</h1>

        <div className="space-y-4">
          <FormInput
            label={t("Email")}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <FormInput
              label={t("Password")}
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <Alert variant="success">{notice}</Alert>

          <PrimaryButton disabled={loading} className="w-full">
            {loading ? t("Signing in…") : t("Log in")}
          </PrimaryButton>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <LinkButton onClick={forgotPassword} className="text-xs">
              {t("Forgot password")}
            </LinkButton>
            <LinkButton onClick={resendConfirmation} className="text-xs">
              {t("Resend confirmation email")}
            </LinkButton>
          </div>

          <p className="text-sm text-muted">
            {t("No account?")}{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              {t("Sign up")}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
