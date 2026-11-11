import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import { PrimaryButton } from "../../components/ui/Button";
import { useT } from "../../lib/i18n";
import LanguageSwitcher from "../../components/LanguageSwitcher";

export default function EmailVerified() {
  const router = useRouter();
  const { t, locale } = useT();
  const [loading, setLoading] = useState(true);
  const [qualifyStatus, setQualifyStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function handleVerification() {
      // Small pause to allow Supabase auth helpers to finish parsing session from URL hash if present
      await new Promise((r) => setTimeout(r, 600));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/referrals/qualify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (active) {
          if (data.success) {
            setQualifyStatus(data.result);
          } else {
            console.warn("Qualify response:", data);
          }
        }
      } catch (err) {
        console.error("Qualify error:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    handleVerification();

    return () => {
      active = false;
    };
  }, []);

  const home = locale === "en" ? "/" : `/${locale}`;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12 font-body text-ink sm:px-6">
      <SEO title={t("Email Verified")} path="/auth/verified" noindex />
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-card sm:p-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft text-3xl">
          ✨
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {t("Email Verified Successfully!")}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          {t("Your DigiVerse account is confirmed. You can now purchase products, manage orders, and earn referral gifts.")}
        </p>

        {qualifyStatus?.reward_issued && (
          <div className="mt-5 rounded-xl border border-brand/30 bg-brand-soft/60 p-4 text-xs font-medium text-brand text-start">
            <div className="flex items-center gap-2 font-semibold text-sm mb-1">
              <span>🎁</span>
              <span>{t("Referral Reward Qualified!")}</span>
            </div>
            <p className="text-muted leading-relaxed">
              {t("Your invitation helped unlock 1 Muse AI Gift Box for your inviter (unlocks in 30 seconds).")}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/account/referrals" className="flex-1">
            <PrimaryButton className="w-full text-sm">
              {t("My Referral Link 🎁")}
            </PrimaryButton>
          </Link>
          <Link href={home} className="flex-1">
            <button className="w-full rounded-xl border border-border bg-surface-alt px-4 py-2.5 text-sm font-semibold text-ink hover:bg-border/60 transition-colors">
              {t("Go to Store")}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

