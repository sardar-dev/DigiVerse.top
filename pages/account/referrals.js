import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import SEO from "../../components/SEO";
import SiteHeader from "../../components/layout/SiteHeader";
import SiteFooter from "../../components/layout/SiteFooter";
import PageContainer from "../../components/layout/PageContainer";
import Alert from "../../components/ui/Alert";
import { FormInput } from "../../components/ui/FormInput";
import { PrimaryButton } from "../../components/ui/Button";
import { useT } from "../../lib/i18n";

export default function ReferralsPage() {
  const { t, locale } = useT();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Username creation state for older accounts without a username
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [userError, setUserError] = useState("");

  const claimHref = locale === "en" ? "/?product=-12" : `/${locale}/?product=-12`;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
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

  // Pre-formatted viral share messages
  const shareText = t(
    "🎁 Get 1 Billion Muse AI Tokens for FREE on DigiVerse! Sign up using my link to claim your reward:"
  );
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n${referralLink}`)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

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
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-soft/70 via-surface to-surface p-6 sm:p-9 shadow-card mb-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand mb-3">
              <span>🎁</span> {t("Referral Rewards Program")}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              {t("Invite Friends, Get 1 Billion Muse AI Tokens Free")}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted leading-relaxed">
              {t(
                "Share your link with friends. When a friend signs up and verifies their email, BOTH of you get 1 Billion Muse AI Tokens (1 Gift Box each)!"
              )}
            </p>
          </div>

          {/* 3-Step Visual Infographic ("How It Works") */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 my-7">
            {/* Step 1 */}
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-brand/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand font-extrabold text-base">
                1
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">{t("Share Your Link")}</h3>
                <p className="mt-0.5 text-xs text-muted leading-relaxed">
                  {t("Send your referral link to friends on WhatsApp, Telegram, or social media.")}
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-brand/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand font-extrabold text-base">
                2
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">{t("Friend Signs Up Free")}</h3>
                <p className="mt-0.5 text-xs text-muted leading-relaxed">
                  {t("Your friend creates a free account and confirms their email address.")}
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft/20 p-4 shadow-sm transition hover:border-success/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success text-white font-extrabold text-lg">
                🎁
              </div>
              <div>
                <h3 className="text-sm font-bold text-success">{t("Both Get 1B Tokens Free!")}</h3>
                <p className="mt-0.5 text-xs text-muted leading-relaxed">
                  {t("Instant reward unlocked! 1B tokens ready in your wallet with zero delay.")}
                </p>
              </div>
            </div>
          </div>

          {/* Referral link & 1-Click Sharing buttons */}
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
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
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

                {/* 1-Click Viral Sharing Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-[#1EBE5D] active:scale-[0.99]"
                  >
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.99.54 1.761.817 2.801.817 3.182 0 5.768-2.587 5.768-5.766.001-3.187-2.575-5.77-5.773-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.112.551 4.095 1.517 5.823l-1.608 5.871 6.027-1.581c1.667.914 3.57 1.439 5.597 1.439 6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
                    </svg>
                    <span>{t("Share on WhatsApp")}</span>
                  </a>

                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E8EC4] active:scale-[0.99]"
                  >
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.34-.674.34l.205-3.048 5.549-5.012c.241-.213-.054-.334-.373-.121l-6.86 4.319-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.946z" />
                    </svg>
                    <span>{t("Share on Telegram")}</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Simplified 3-Card Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
          {/* Card 1: Available Gift Boxes */}
          <div className="rounded-2xl border border-success/40 bg-gradient-to-br from-surface to-success-soft/30 p-5 shadow-card flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-success">
                🎁 {t("Available Gift Boxes")}
              </span>
              <div className="mt-2 text-3xl sm:text-4xl font-extrabold text-success">
                {stats?.available_count ?? 0}
              </div>
              <p className="mt-1 text-xs text-muted">
                {t("1 Box = 1 Billion Muse AI Tokens · Ready to claim now")}
              </p>
            </div>
            {(stats?.available_count ?? 0) > 0 && (
              <Link
                href={claimHref}
                className="mt-4 block w-full text-center rounded-xl bg-success px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-success/90 active:scale-[0.99]"
              >
                ⚡ {t("Claim 1B Free Tokens Now")}
              </Link>
            )}
          </div>

          {/* Card 2: Friends Invited */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                👥 {t("Friends Invited")}
              </span>
              <div className="mt-2 text-3xl sm:text-4xl font-extrabold text-ink">
                {referrals.length}
              </div>
              <p className="mt-1 text-xs text-muted">
                {t("Every verified friend earns you 1 Gift Box")}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted">
              {stats?.total_earned ?? 0} {t("total lifetime boxes earned (Max 15)")}
            </div>
          </div>

          {/* Card 3: Free Tokens Claimed */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                ⚡ {t("Free Tokens Claimed")}
              </span>
              <div className="mt-2 text-3xl sm:text-4xl font-extrabold text-brand">
                {stats?.redeemed_count ?? 0}B
              </div>
              <p className="mt-1 text-xs text-muted">
                {t("Successfully fulfilled to Muse AI")}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted">
              {t("Up to 3 boxes can be claimed daily")}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted mb-8 px-1">
          💡 {t("Note: You can claim up to 3 gift boxes per day. Lifetime program limit is 15 gifts.")}
        </p>

        {/* Gift Wallet Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-ink">{t("Your Gift Boxes")}</h2>
              <p className="text-xs text-muted">
                {t("Instant reward boxes earned from referring friends.")}
              </p>
            </div>
            {(stats?.available_count ?? 0) > 0 && (
              <Link
                href={claimHref}
                className="text-xs font-bold text-brand hover:underline"
              >
                ⚡ {t("Claim 1B Tokens →")}
              </Link>
            )}
          </div>

          {gifts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted">
              <span className="text-4xl block mb-2">🎁</span>
              <p className="text-sm font-medium text-ink">{t("No gift boxes yet")}</p>
              <p className="text-xs text-muted mt-1">
                {t("Share your referral link with friends to earn your first free gift box!")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {gifts.map((gift) => {
                const isRedeemed = gift.status === "redeemed";
                const isRevoked = gift.status === "revoked";
                const isAvailable = !isRedeemed && !isRevoked;

                return (
                  <div
                    key={gift.id}
                    className={`relative rounded-2xl border p-4 transition-all shadow-card ${
                      isAvailable
                        ? "border-success/40 bg-gradient-to-br from-surface to-success-soft/20"
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
                          ✓ {t("Available")}
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
                          ? t("Ready to claim now")
                          : isRedeemed
                          ? t("Order #{id}", { id: String(gift.order_id || "").slice(0, 8).toUpperCase() })
                          : gift.revoked_reason || t("Cancelled")}
                      </span>

                      {isAvailable && (
                        <Link
                          href={claimHref}
                          className="font-bold text-brand hover:underline"
                        >
                          ⚡ {t("Claim Now →")}
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
                          <span className="text-success font-bold">+1 Gift Box 🎁</span>
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
