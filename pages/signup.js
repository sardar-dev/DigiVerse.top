import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import SEO from "../components/SEO";
import Alert from "../components/ui/Alert";
import { FormInput } from "../components/ui/FormInput";
import { PrimaryButton } from "../components/ui/Button";
import { SITE_NAME } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Signup() {
  const { t, locale } = useT();
  const home = locale === "en" ? "/" : `/${locale}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      if (error.message?.toLowerCase().includes("rate limit")) {
        return setError(t("Too many signups right now — please wait a few minutes and try again."));
      }
      return setError(error.message);
    }
    if (data.session) {
      // Email confirmation is disabled on this project — the user is
      // already signed in, no need to tell them to check their inbox.
      window.location.href = home;
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
        <SEO title={t("Sign up")} path="/signup" noindex />
      <div className="absolute end-4 top-4"><LanguageSwitcher /></div>
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 text-center shadow-card">
          <h1 className="text-2xl font-semibold text-ink">{t("Check your email")}</h1>
          <p className="mt-3 text-sm text-muted">
            {t("We sent a confirmation link to {email}. Confirm it, then log in.", { email })}
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
            {t("Go to login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
      <SEO title={t("Sign up")} path="/signup" noindex />
      <div className="absolute end-4 top-4"><LanguageSwitcher /></div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 shadow-card"
      >
        <Link href="/" className="mb-1 block text-base font-semibold text-ink">
          {SITE_NAME}
        </Link>
        <h1 className="mb-5 text-2xl font-semibold text-ink">{t("Create an account")}</h1>

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
            {loading ? t("Creating…") : t("Sign up")}
          </PrimaryButton>

          <p className="text-sm text-muted">
            {t("Already have an account?")}{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              {t("Log in")}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
