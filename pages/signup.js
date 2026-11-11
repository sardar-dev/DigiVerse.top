import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import SEO from "../components/SEO";
import Alert from "../components/ui/Alert";
import { FormInput } from "../components/ui/FormInput";
import { PrimaryButton } from "../components/ui/Button";
import { SITE_NAME } from "../lib/siteConfig";
import { useT } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { validateRegistrationEmail, ALLOWED_EMAIL_DOMAINS } from "../lib/emailAllowlist";
import { getDeviceId } from "../lib/deviceId";
import GoogleIcon from "../components/icons/GoogleIcon";

const REF_STORAGE_KEY = "dg_ref_inviter";

export default function Signup() {
  const router = useRouter();
  const { t, locale } = useT();
  const home = locale === "en" ? "/" : `/${locale}`;

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [refInviter, setRefInviter] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");

  // Capture referral parameter from URL or persistent storage
  useEffect(() => {
    let code = (router.query.ref || "").toString().trim();
    if (code) {
      setRefInviter(code);
      try {
        localStorage.setItem(REF_STORAGE_KEY, code);
      } catch {}
    } else {
      try {
        const stored = localStorage.getItem(REF_STORAGE_KEY);
        if (stored) setRefInviter(stored);
      } catch {}
    }
  }, [router.query.ref]);

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);

    // Persist referral code in localStorage so /auth/callback can link it
    if (refInviter) {
      try {
        localStorage.setItem(REF_STORAGE_KEY, refInviter);
      } catch {}
    }

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
    setResendNotice("");

    // 1. Client-side Username Validation
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      return setError(t("Username is required."));
    }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUser)) {
      return setError(
        t("Username must be 3–24 characters and can only contain letters, numbers, and underscores (_).")
      );
    }

    // 2. Client-side Email Domain Allowlist Check
    const emailCheck = validateRegistrationEmail(email);
    if (!emailCheck.valid) {
      return setError(emailCheck.error);
    }

    // 3. Client-side Password Check: No restriction, allow any format/length
    if (!password) {
      return setError(t("Password is required."));
    }

    setLoading(true);

    // 4. Backend Pre-check for Uniqueness and Anti-Fraud
    const deviceId = getDeviceId();
    let backendValidation;
    try {
      const res = await fetch("/api/auth/validate-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUser,
          email: emailCheck.normalizedEmail,
          password,
          ref: refInviter || undefined,
          device_id: deviceId,
        }),
      });
      backendValidation = await res.json();
      if (!res.ok || !backendValidation.success) {
        setLoading(false);
        return setError(backendValidation.error || t("Validation failed. Please check your details."));
      }
    } catch {
      // If validation endpoint times out, fall through to Supabase auth with metadata
    }

    // 5. Supabase Auth Registration with user metadata
    const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://digiverse.top";
    const redirectUrl = `${siteUrl}/auth/verified`;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: emailCheck.normalizedEmail,
      password,
      options: {
        data: {
          username: cleanUser,
          ref: refInviter || null,
          device_id: deviceId,
          registration_ip: backendValidation?.clientIp || null,
        },
        emailRedirectTo: redirectUrl,
      },
    });

    setLoading(false);

    if (signUpError) {
      const msg = (signUpError.message || "").toLowerCase();
      if (msg.includes("rate limit")) {
        return setError(t("Too many signups right now — please wait a few minutes and try again."));
      }
      if (msg.includes("database error saving new user") || msg.includes("saving new user")) {
        return setError(
          t("Multiple accounts from the same mobile or device are not allowed. Please log in to your existing account.")
        );
      }
      return setError(signUpError.message);
    }

    // If email confirmation is disabled on Supabase, user is immediately signed in
    if (data?.session) {
      try {
        await fetch("/api/referrals/qualify", { method: "POST" });
      } catch {}
      window.location.href = home;
      return;
    }

    setDone(true);
  }

  async function handleResend() {
    if (!email) return;
    setResending(true);
    setResendNotice("");
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
    });
    setResending(false);
    if (resendErr) {
      setError(resendErr.message);
    } else {
      setResendNotice(t("Confirmation email resent — please check your inbox and spam folder."));
    }
  }

  if (done) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
        <SEO title={t("Check your email")} path="/signup" noindex />
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-card sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-2xl">
            ✉️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{t("Check your email")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t("We sent a verification link to {email}.", { email: email.trim().toLowerCase() })}
          </p>
          <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/40 p-3.5 text-xs text-brand font-medium">
            🔒 {t("Email verification is mandatory to activate your account and qualify for referral rewards.")}
          </div>

          {resendNotice && <Alert variant="success" className="mt-4">{resendNotice}</Alert>}
          {error && <Alert variant="error" className="mt-4">{error}</Alert>}

          <div className="mt-6 flex flex-col gap-2.5">
            <PrimaryButton
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full text-sm"
            >
              {resending ? t("Sending…") : t("Resend verification email")}
            </PrimaryButton>
            <Link
              href="/login"
              className="inline-block py-2 text-sm font-medium text-muted hover:text-ink transition-colors"
            >
              {t("Return to login")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
      <SEO title={t("Sign up")} path="/signup" noindex />
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 shadow-card sm:p-8">
        <Link href="/" className="mb-1 block text-base font-semibold text-ink">
          {SITE_NAME}
        </Link>
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-ink">{t("Create an account")}</h1>
        <p className="mb-5 text-xs text-muted">
          {t("Enter your username, email, and password to register.")}
        </p>

        {refInviter && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-xs font-semibold text-brand">
            <span className="text-base">🎁</span>
            <span>{t("Referred by {user} — Earn free Muse AI gifts!", { user: `@${refInviter}` })}</span>
          </div>
        )}

        {/* Continue with Google */}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            id="username"
            name="username"
            label={t("Username")}
            type="text"
            required
            autoComplete="username"
            placeholder="e.g. ali123"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            hint={t("3–24 characters, letters, numbers, and underscores only.")}
          />

          <FormInput
            id="email"
            name="email"
            label={t("Email")}
            type="email"
            required
            autoComplete="email"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint={t("Allowed domains: {domains}", { domains: ALLOWED_EMAIL_DOMAINS.join(", ") })}
          />

          <div>
            <FormInput
              id="password"
              name="password"
              label={t("Password")}
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
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

          <PrimaryButton disabled={loading || googleLoading} className="w-full">
            {loading ? t("Creating account…") : t("Sign up")}
          </PrimaryButton>

          <p className="text-center text-sm text-muted">
            {t("Already have an account?")}{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              {t("Log in")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
