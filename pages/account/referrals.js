import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Alert from "../../components/ui/Alert";
import { FormInput } from "../../components/ui/FormInput";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/States";
import { useT } from "../../lib/i18n";

export default function ReferralsPage() {
  const { t, locale } = useT();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Username creation modal / inline state for legacy users
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [userError, setUserError] = useState("");

  useEffect(() => {
    loadData();
    // 1-second interval to drive live countdowns
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadData() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) {
      window.location.href = locale === "en" ? "/login" : `/${locale}/login`;
      return;
    }
    setSession(currentSession);

    try {
      const res = await fetch("/api/referrals/me");
      const json = await res.json();
      if (json.success) {
        setProfile(json.profile);
        setStats(json.stats);
        setGifts(json.gifts || []);
        setReferrals(json.referrals || []);
        setSettings(json.settings);
      }
    } catch (err) {
      console.error("Failed to load referrals:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimUsername(e) {
    e.preventDefault();
    setUserError("");
    setSavingUsername(true);

    try {
      const res = await fetch("/api/referrals/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUserError(data.error || "Failed to set username.");
      } else {
        await loadData();
      }
    } catch {
      setUserError("Network error. Please try again.");
    } finally {
      setSavingUsername(false);
    }
  }

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://digiverse.top";
  const referralLink = profile?.username ? `${siteOrigin}/signup?ref=${profile.username}` : "";

  function handleCopy() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Format countdown string: mm:ss
  function formatCountdown(targetIso) {
    const targetMs = new Date(targetIso).getTime();
    const diffSec = Math.max(0, Math.floor((targetMs - now) / 1000));
    if (diffSec <= 0) return null;
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <SEO
        title={t("Referrals & Gift Wallet")}
        description={t("Invite friends and earn free Muse AI token gift boxes on DigiVerse.")}
        path="/account/referrals"
        noindex
      />
      <SiteHeader session={session} />

      <PageContainer className="flex-1 py-8 sm:py-10">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-soft via-surface to-surface-alt p-6 sm:p-9 shadow-card mb-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand mb-3">
              <span>🎁</span> {t("Referral Rewards Program")}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              {t("Invite Friends, Get Free Muse AI Tokens")}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted leading-relaxed">
              {t("Invite friends to DigiVerse! When a friend registers using your link, BOTH of you get 1 Billion Muse AI Tokens (1 Gift Box each)! Maximum 15 lifetime gifts.")}
            </p>
          </div>

          {/* Referral link bar */}
          <div className="mt-6 max-w-xl">
            {profile && !profile.username ? (
              <form onSubmit={handleClaimUsername} className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-card">
                <p className="text-xs font-semibold text-brand">
                  {t("👉 Choose your unique username to activate your referral link:")}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <FormInput
                    placeholder="e.g. ali123"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                    className="flex-1 font-mono text-sm"
                  />
                  <PrimaryButton disabled={savingUsername} className="text-sm whitespace-nowrap">
                    {savingUsername ? t("Saving…") : t("Claim Username")}
                  </PrimaryButton>
                </div>
                {userError && <Alert variant="error">{userError}</Alert>}
              </form>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">
                  {t("Your Unique Referral Link")}
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-1.5 sm:p-2 shadow-card">
                  <input
                    type="text"
                    readOnly
                    value={referralLink}
                    className="w-full bg-transparent px-3 py-1.5 font-mono text-xs sm:text-sm text-ink outline-none selection:bg-brand-soft"
                    onClick={(e) => e.target.select()}
                  />
                  <PrimaryButton
                    type="button"
                    onClick={handleCopy}
                    className="whitespace-nowrap text-xs sm:text-sm px-4 py-2"
                  >
                    {copied ? t("Copied! ✓") : t("Copy Link")}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-8">
          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-card">
            <span className="text-xs font-semibold text-muted">{t("Total Gifts Earned")}</span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-ink">
              {stats?.total_earned ?? 0} <span className="text-xs text-muted font-normal">/ {stats?.max_lifetime_gifts ?? 15}</span>
            </div>
            <span className="mt-1 block text-[11px] text-muted">{t("Lifetime reward cap")}</span>
          </div>

          <div className="rounded-2xl border border-success/30 bg-success-soft/30 p-4 sm:p-5 shadow-card">
            <span className="text-xs font-semibold text-success">{t("Available Now")}</span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-success">
              {stats?.available_count ?? 0}
            </div>
            <span className="mt-1 block text-[11px] text-muted">{t("Ready for checkout")}</span>
          </div>

          <div className="rounded-2xl border border-brand/30 bg-brand-soft/40 p-4 sm:p-5 shadow-card">
            <span className="text-xs font-semibold text-brand">{t("Locked (30s)")}</span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-brand">
              {stats?.locked_count ?? 0}
            </div>
            <span className="mt-1 block text-[11px] text-muted">
              {stats?.next_unlock_seconds > 0 ? t("Unlocking in {n}s", { n: stats.next_unlock_seconds }) : t("Verified rewards")}
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-card">
            <span className="text-xs font-semibold text-muted">{t("Redeemed")}</span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-ink">
              {stats?.redeemed_count ?? 0}
            </div>
            <span className="mt-1 block text-[11px] text-muted">{t("Free tokens claimed")}</span>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-card">
            <span className="text-xs font-semibold text-muted">{t("Daily Allowance")}</span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-ink">
              {stats?.remaining_today ?? 3} <span className="text-xs text-muted font-normal">/ {stats?.daily_limit ?? 3}</span>
            </div>
            <span className="mt-1 block text-[11px] text-muted">{t("Available today")}</span>
          </div>
        </div>

        {/* Gift Wallet Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-ink">{t("Your Gift Box Wallet")}</h2>
              <p className="text-xs text-muted">{t("1 Gift Box = 1 Billion Muse AI Tokens. Automatically unlocked 30s after your friend verifies.")}</p>
            </div>
            <Link
              href="/"
              className="text-xs font-semibold text-brand hover:underline"
            >
              {t("Redeem in Store →")}
            </Link>
          </div>

          {gifts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted">
              <span className="text-4xl block mb-2">🎁</span>
              <p className="text-sm font-medium text-ink">{t("No gift boxes yet")}</p>
              <p className="text-xs text-muted mt-1">
                {t("Share your referral link with friends to start earning free Muse AI tokens.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {gifts.map((gift) => {
                const countdown = gift.status === "locked" ? formatCountdown(gift.available_at) : null;
                const isAvailable = gift.status === "available" || (gift.status === "locked" && !countdown);
                const isRedeemed = gift.status === "redeemed";
                const isRevoked = gift.status === "revoked";

                return (
                  <div
                    key={gift.id}
                    className={`relative rounded-2xl border p-4 transition-all shadow-card ${
                      isAvailable
                        ? "border-success/40 bg-gradient-to-br from-surface to-success-soft/20"
                        : gift.status === "locked" && countdown
                        ? "border-brand/40 bg-gradient-to-br from-surface to-brand-soft/20"
                        : isRedeemed
                        ? "border-border bg-surface/50 opacity-70"
                        : "border-danger/30 bg-danger-soft/10 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-alt text-xl shadow-inner">
                          {isRedeemed ? "✅" : isRevoked ? "❌" : "🎁"}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-ink">1B Muse AI Tokens</div>
                          <div className="text-[11px] text-muted">
                            {new Date(gift.created_at).toLocaleDateString(locale, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      {isAvailable && (
                        <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
                          {t("Available")}
                        </span>
                      )}
                      {gift.status === "locked" && countdown && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-bold text-brand font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                          {countdown}
                        </span>
                      )}
                      {isRedeemed && (
                        <span className="rounded-full bg-border px-2.5 py-1 text-[11px] font-semibold text-muted">
                          {t("Redeemed")}
                        </span>
                      )}
                      {isRevoked && (
                        <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger">
                          {t("Revoked")}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="text-muted">
                        {isAvailable
                          ? t("Ready to use at checkout")
                          : gift.status === "locked" && countdown
                          ? t("Unlocking in {time}", { time: countdown })
                          : isRedeemed
                          ? t("Order #{id}", { id: String(gift.order_id || "").slice(0, 8) })
                          : gift.revoked_reason || t("Cancelled")}
                      </span>

                      {isAvailable && (
                        <Link href="/" className="font-semibold text-brand hover:underline">
                          {t("Use Now →")}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Referrals History Table */}
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
          <h2 className="text-lg font-bold text-ink mb-1">{t("Referral History")}</h2>
          <p className="text-xs text-muted mb-4">{t("Track friends who signed up using your link.")}</p>

          {referrals.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              {t("No referrals yet. Share your link above to invite your first friend!")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="pb-2.5 font-semibold text-start">{t("User")}</th>
                    <th className="pb-2.5 font-semibold text-start">{t("Registered")}</th>
                    <th className="pb-2.5 font-semibold text-start">{t("Email Status")}</th>
                    <th className="pb-2.5 font-semibold text-end">{t("Reward")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {referrals.map((r) => (
                    <tr key={r.id} className="text-ink">
                      <td className="py-3 font-medium">@{r.displayName}</td>
                      <td className="py-3 text-muted">
                        {new Date(r.created_at).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3">
                        {r.status === "pending_verification" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                            ⏳ {t("Pending Verification")}
                          </span>
                        ) : r.status === "flagged_suspicious" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                            ⚠️ {t("Under Review")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                            ✓ {t("Verified")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-end font-semibold">
                        {r.reward_issued ? (
                          <span className="text-success">+1 Gift Box 🎁</span>
                        ) : r.status === "qualified_cap_reached" ? (
                          <span className="text-muted">{t("Cap Reached (15)")}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageContainer>
      <SiteFooter />
    </div>
  );
}

