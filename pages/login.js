import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import SEO from "../components/SEO";
import Alert from "../components/ui/Alert";
import { FormInput } from "../components/ui/FormInput";
import { PrimaryButton, LinkButton } from "../components/ui/Button";
import { SITE_NAME } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";
import GoogleIcon from "../components/icons/GoogleIcon";

export default function Login() {
  const router = useRouter();
  const { t, locale } = useT();
  const home = locale === "en" ? "/" : `/${locale}`;
  const buying = router.query.buying;
  const price = router.query.price;
  const returnTo = router.query.returnTo;
  const signupLink = buying
    ? `/signup?buying=${encodeURIComponent(buying)}&price=${encodeURIComponent(price || "")}&returnTo=${encodeURIComponent(returnTo || "")}`
    : "/signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.google_auth_enabled === "boolean") {
          setGoogleAuthEnabled(d.google_auth_enabled);
        }
      })
      .catch(() => {});
  }, []);

  async function handleGoogleSignIn() {
    setError("");
    setNotice("");
    setGoogleLoading(true);

    try {
      const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://digiverse.top";
      const { data, error: googleErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${siteUrl}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (googleErr) {
        setGoogleLoading(false);
        setError(googleErr.message);
      }
    } catch (err) {
      setGoogleLoading(false);
      setError(err.message || "Failed to initiate Google sign-in.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    const safeReturn = (typeof returnTo === "string" && returnTo.startsWith("/")) ? returnTo : home;
    window.location.href = safeReturn;
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
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-7 shadow-card">
        <Link href="/" className="mb-1 block text-base font-semibold text-ink">
          {SITE_NAME}
        </Link>
        <h1 className="mb-4 text-2xl font-semibold text-ink">{t("Log in")}</h1>

        {buying && (
          <div className="mb-4 rounded-xl border border-brand/30 bg-brand-soft/40 p-3.5 text-xs text-ink">
            <div className="flex items-center gap-2 font-semibold text-brand">
              <span aria-hidden="true">🛒</span>
              <span>{t("You were buying {name}", { name: buying })}</span>
            </div>
            <p className="mt-1 text-muted">
              {price ? t("Amount: ${price} · ", { price }) : ""}
              {t("Log in to pay with your wallet balance.")}
            </p>
          </div>
        )}

        {/* Continue with Google (shown only when enabled in Admin Settings) */}
        {googleAuthEnabled && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all hover:bg-surface-alt hover:border-border/80 active:scale-[0.99] disabled:opacity-50"
            >
              <GoogleIcon className="h-4 w-4 shrink-0" />
              <span>{googleLoading ? t("Connecting to Google…") : t("Continue with Google")}</span>
            </button>

            <div className="relative my-4 flex items-center justify-center">
              <div className="w-full border-t border-border" />
              <span className="absolute bg-surface px-3 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("or")}
              </span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            id="email"
            name="email"
            label={t("Email")}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <FormInput
              id="password"
              name="password"
              label={t("Password")}
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
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

          <PrimaryButton disabled={loading || googleLoading} className="w-full">
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
            <Link href={signupLink} className="font-medium text-brand hover:underline">
              {t("Sign up")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
