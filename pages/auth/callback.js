import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { getDeviceId } from "../../lib/deviceId";
import SEO from "../../components/SEO";
import Alert from "../../components/ui/Alert";
import { PrimaryButton } from "../../components/ui/Button";
import { SITE_NAME } from "../../lib/siteConfig";
import { useT } from "../../lib/i18n";

export default function AuthCallback() {
  const router = useRouter();
  const { t, locale } = useT();
  const home = locale === "en" ? "/" : `/${locale}`;

  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState(t("Connecting to Google…"));

  useEffect(() => {
    let active = true;

    async function handleOAuthCallback() {
      try {
        if (typeof window === "undefined") return;

        // 1. Check for OAuth error in URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const urlError =
          urlParams.get("error_description") ||
          urlParams.get("error") ||
          new URLSearchParams(window.location.hash.substring(1)).get("error_description");

        if (urlError) {
          throw new Error(urlError);
        }

        // 2. Exchange authorization code if present (PKCE Flow)
        const code = urlParams.get("code");
        if (code) {
          if (active) setStatusText(t("Verifying your Google session…"));
          try {
            await supabase.auth.exchangeCodeForSession(code);
          } catch (codeErr) {
            console.warn("[auth/callback] exchangeCode error:", codeErr);
          }
        }

        // 3. Poll for active session (handles both code exchange and hash tokens)
        if (active) setStatusText(t("Securing your session…"));
        let currentSession = null;
        for (let i = 0; i < 5; i++) {
          const { data, error: sessionErr } = await supabase.auth.getSession();
          if (sessionErr) throw sessionErr;
          if (data?.session) {
            currentSession = data.session;
            break;
          }
          await new Promise((r) => setTimeout(r, 350));
        }

        if (!currentSession) {
          throw new Error(t("Unable to verify Google login. Please try again."));
        }

        // 4. Link referral attribution and ensure user profile exists
        if (active) setStatusText(t("Finalizing account setup…"));
        let storedRef = null;
        try {
          storedRef = localStorage.getItem("dg_ref_inviter");
        } catch {}

        const deviceId = getDeviceId();

        try {
          const postRes = await fetch("/api/auth/oauth-post-login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: currentSession.access_token
                ? `Bearer ${currentSession.access_token}`
                : "",
            },
            body: JSON.stringify({
              ref: storedRef || undefined,
              device_id: deviceId || undefined,
            }),
          });

          if (postRes.ok && storedRef) {
            try {
              localStorage.removeItem("dg_ref_inviter");
            } catch {}
          }
        } catch (postErr) {
          console.warn("[auth/callback] post-login error:", postErr);
        }

        // 5. Determine destination and redirect
        let destination = home;
        try {
          const storedRedirect = sessionStorage.getItem("dg_auth_redirect");
          if (storedRedirect && storedRedirect.startsWith("/")) {
            destination = storedRedirect;
            sessionStorage.removeItem("dg_auth_redirect");
          }
        } catch {}

        if (active) {
          setStatusText(t("Redirecting you now…"));
          window.location.href = destination;
        }
      } catch (err) {
        if (!active) return;
        console.error("[auth/callback] fatal error:", err);
        setError(err.message || t("Sign in with Google failed. Please try again."));
      }
    }

    handleOAuthCallback();

    return () => {
      active = false;
    };
  }, [home, t]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
      <SEO title={t("Authenticating…")} path="/auth/callback" noindex />

      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-card sm:p-8">
        <Link href="/" className="mb-4 inline-block text-base font-semibold text-ink">
          {SITE_NAME}
        </Link>

        {error ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-2xl">
              ⚠️
            </div>
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {t("Sign-in Issue")}
            </h1>
            <Alert variant="error">{error}</Alert>
            <div className="pt-2 flex flex-col gap-2.5">
              <Link href="/login" className="w-full">
                <PrimaryButton className="w-full text-sm">
                  {t("Back to Login")}
                </PrimaryButton>
              </Link>
              <Link
                href="/"
                className="inline-block py-2 text-sm font-medium text-muted hover:text-ink transition-colors"
              >
                {t("Return to Store")}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-brand/20 animate-ping opacity-30" />
              <div className="h-12 w-12 rounded-full border-3 border-brand border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xl">
                ✨
              </div>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-ink">
              {statusText}
            </h1>
            <p className="text-xs text-muted">
              {t("Please keep this window open while we complete your sign-in.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

