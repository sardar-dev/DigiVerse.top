import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { SITE_NAME } from "../../lib/siteConfig";
import { supabase } from "../../lib/supabaseClient";
import { useT } from "../../lib/i18n";
import LanguageSwitcher from "../LanguageSwitcher";

// SVG Icons for clean, lightweight visuals
function StoreIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 9l1-5h16l1 5M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 21V12h6v9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GiftIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M19 7V4a1 1 0 00-1-1H5a2 2 0 000 4h15a1 1 0 011 1v4h-4a2 2 0 000 4h4v4a1 1 0 01-1 1H5a2 2 0 01-2-2V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function OrdersIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SupportIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AdminIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignOutIcon({ className = "h-4 w-4" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Shared storefront/account header. Pages that already track auth pass
// `session` / `balance` / `onSignOut` in (no extra requests). If a prop
// is omitted (e.g. Terms, Privacy, 404) the header loads it itself.
export default function SiteHeader({
  session: sessionProp,
  balance: balanceProp,
  onSignOut: onSignOutProp,
}) {
  const router = useRouter();
  const { t, locale } = useT();
  const [open, setOpen] = useState(false); // mobile drawer
  const [menu, setMenu] = useState(false); // account dropdown
  const menuRef = useRef(null);
  const mobileRef = useRef(null);

  const [ownSession, setOwnSession] = useState(undefined);
  const [ownBalance, setOwnBalance] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  const needSession = sessionProp === undefined;
  const needBalance = balanceProp === undefined;
  const userId = sessionProp?.user?.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let sess = sessionProp;
      if (needSession) {
        const { data } = await supabase.auth.getSession();
        sess = data.session;
        if (!cancelled) setOwnSession(sess);
      }
      if (sess?.user?.id) {
        const { data } = await supabase
          .from("profiles")
          .select("balance, is_admin")
          .eq("id", sess.user.id)
          .single();
        if (!cancelled && data) {
          if (needBalance) setOwnBalance(Number(data.balance || 0));
          setIsAdmin(Boolean(data.is_admin));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needSession, needBalance, userId]);

  const session = needSession ? ownSession : sessionProp;
  const balance = needBalance ? ownBalance : balanceProp;
  const onSignOut =
    onSignOutProp ||
    (async () => {
      await supabase.auth.signOut();
      window.location.href = locale === "en" ? "/" : `/${locale}`;
    });

  const links = session
    ? [
        { href: "/", label: t("Store"), icon: <StoreIcon /> },
        { href: "/account/referrals", label: t("Referrals 🎁"), icon: <GiftIcon />, badge: "Free" },
        { href: "/account/wallet", label: t("Wallet"), icon: <WalletIcon /> },
        { href: "/account/orders", label: t("My Orders"), icon: <OrdersIcon /> },
        { href: "/account/support", label: t("Support"), icon: <SupportIcon />, live: true },
      ]
    : [
        { href: "/", label: t("Store"), icon: <StoreIcon /> },
        { href: "/account/support", label: t("Support"), icon: <SupportIcon />, live: true },
      ];

  const isActive = (href) => router.pathname === href;
  const email = session?.user?.email || "";
  const initial = (email[0] || "U").toUpperCase();
  const hasBalance = typeof balance === "number";
  // SITE_NAME may carry a trailing emoji; the logo mark replaces it.
  const brandName = SITE_NAME.replace(/\s*\p{Extended_Pictographic}+/gu, "").trim();

  // Close menus on navigation, outside click and Escape.
  useEffect(() => {
    const close = () => {
      setOpen(false);
      setMenu(false);
    };
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  useEffect(() => {
    if (!menu && !open) return;
    const onDown = (e) => {
      if (menu && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenu(false);
      }
      if (open && mobileRef.current && !mobileRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenu(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, open]);

  return (
    <header className="sticky top-0 z-40 w-full max-w-full border-b border-border/80 bg-surface/85 backdrop-blur-xl transition-all duration-200 shadow-[0_1px_3px_0_rgba(23,33,58,0.02)]">
      {/* Top subtle ambient highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/35 to-transparent" />

      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        {/* Brand Lockup */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 min-w-0 transition-transform active:scale-[0.98]"
          aria-label={`${brandName} home`}
        >
          <div className="relative flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-border/80 shadow-card transition-all duration-300 group-hover:ring-brand/40 group-hover:shadow-[0_0_18px_rgba(49,105,245,0.22)]">
            <img
              src="/logo-mark.png"
              alt=""
              width={36}
              height={36}
              className="h-8 w-8 sm:h-9 sm:w-9 object-cover transition-transform duration-300 group-hover:scale-105"
              loading="eager"
              decoding="async"
              fetchpriority="high"
            />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base sm:text-lg font-bold tracking-tight text-ink transition-colors duration-200 group-hover:text-brand truncate">
              {brandName}
            </span>
            <span
              className="hidden sm:inline-flex items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success ring-1 ring-success/20"
              title="Cloud Network Online"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Live
            </span>
          </div>
        </Link>

        {/* Center Navigation Island (Desktop) */}
        <nav
          className="hidden items-center gap-1 rounded-2xl border border-border/70 bg-surface/60 p-1 shadow-[inset_0_1px_2px_rgba(23,33,58,0.03)] backdrop-blur-sm lg:flex"
          aria-label="Main Navigation"
        >
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-150 active:scale-95 ${
                  active
                    ? "bg-brand-soft text-brand font-semibold shadow-[inset_0_0_0_1px_rgba(49,105,245,0.22)]"
                    : "text-muted hover:bg-brand-soft/70 hover:text-ink"
                }`}
              >
                <span className={active ? "text-brand" : "text-muted transition-colors"}>
                  {l.icon}
                </span>
                <span>{l.label}</span>
                {l.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      active
                        ? "bg-brand text-white"
                        : "bg-brand-soft text-brand ring-1 ring-brand/20"
                    }`}
                  >
                    {l.badge}
                  </span>
                )}
                {l.live && !active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-success" title="24/7 Live" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Desktop Action Area */}
        <div className="hidden items-center gap-2.5 lg:flex">
          <LanguageSwitcher />

          {session ? (
            <>
              {hasBalance && (
                <Link
                  href="/account/wallet"
                  className="group relative flex items-center gap-2 rounded-xl border border-border/80 bg-surface/90 px-3 py-1.5 shadow-sm transition-all duration-200 hover:border-brand/40 hover:bg-brand-soft/50 hover:shadow-card active:scale-[0.98]"
                  title={t("Wallet balance")}
                >
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                  </span>
                  <div className="flex items-baseline gap-1 text-xs">
                    <span className="hidden xl:inline text-[11px] font-medium text-muted uppercase tracking-wider">
                      {t("Balance")}:
                    </span>
                    <span
                      className="font-mono font-bold text-ink transition-colors group-hover:text-brand"
                      dir="ltr"
                    >
                      ${balance.toFixed(2)}
                    </span>
                  </div>
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-white"
                    title={t("Top up")}
                  >
                    +
                  </span>
                </Link>
              )}

              {/* User Account Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenu((m) => !m)}
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  aria-label={t("Account menu")}
                  className="group flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/90 p-1 pe-2 shadow-sm transition-all duration-200 hover:border-brand/40 hover:bg-brand-soft/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-brand to-indigo-600 text-xs font-bold text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                    {initial}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className={`text-muted transition-transform duration-200 ${
                      menu ? "rotate-180 text-brand" : "group-hover:text-ink"
                    }`}
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {menu && (
                  <div
                    role="menu"
                    className="absolute end-0 mt-2.5 w-64 origin-top-right overflow-hidden rounded-2xl border border-border/90 bg-surface/98 p-1.5 shadow-[0_16px_40px_-6px_rgba(23,33,58,0.18)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 z-50"
                  >
                    {/* User Info Header */}
                    <div className="mb-1 rounded-xl border border-brand/10 bg-gradient-to-br from-brand-soft/70 via-surface to-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted shadow-sm">
                          {isAdmin ? "⚡ " + t("Administrator") : "👤 " + t("Customer")}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-medium text-muted">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" />
                          Online
                        </span>
                      </div>
                      <div className="mt-1.5 truncate text-xs font-semibold text-ink" title={email}>
                        {email}
                      </div>
                      {hasBalance && (
                        <div className="mt-2 flex items-center justify-between rounded-lg border border-border/80 bg-surface/90 px-2.5 py-1.5">
                          <div className="text-xs text-muted">
                            {t("Balance")}:{" "}
                            <span className="font-mono font-bold text-ink" dir="ltr">
                              ${balance.toFixed(2)}
                            </span>
                          </div>
                          <Link
                            href="/account/wallet"
                            onClick={() => setMenu(false)}
                            className="rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-dark"
                          >
                            {t("Top up")}
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Navigation Items */}
                    <div className="space-y-0.5 text-xs sm:text-sm">
                      <Link
                        role="menuitem"
                        href="/account/referrals"
                        onClick={() => setMenu(false)}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-ink transition-colors hover:bg-brand-soft"
                      >
                        <span className="flex items-center gap-2">
                          <GiftIcon className="h-4 w-4 text-brand" />
                          <span>{t("Referrals & Gift Wallet 🎁")}</span>
                        </span>
                        <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand ring-1 ring-brand/20">
                          Free
                        </span>
                      </Link>

                      <Link
                        role="menuitem"
                        href="/account/wallet"
                        onClick={() => setMenu(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink transition-colors hover:bg-brand-soft"
                      >
                        <WalletIcon className="h-4 w-4 text-muted" />
                        <span>{t("Wallet & top-up")}</span>
                      </Link>

                      <Link
                        role="menuitem"
                        href="/account/orders"
                        onClick={() => setMenu(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink transition-colors hover:bg-brand-soft"
                      >
                        <OrdersIcon className="h-4 w-4 text-muted" />
                        <span>{t("My orders")}</span>
                      </Link>

                      <Link
                        role="menuitem"
                        href="/account/support"
                        onClick={() => setMenu(false)}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-ink transition-colors hover:bg-brand-soft"
                      >
                        <span className="flex items-center gap-2">
                          <SupportIcon className="h-4 w-4 text-muted" />
                          <span>{t("Support")}</span>
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      </Link>

                      {isAdmin && (
                        <Link
                          role="menuitem"
                          href="/admin"
                          onClick={() => setMenu(false)}
                          className="flex items-center justify-between rounded-xl px-3 py-2 font-medium text-brand transition-colors hover:bg-brand-soft"
                        >
                          <span className="flex items-center gap-2">
                            <AdminIcon className="h-4 w-4 text-brand" />
                            <span>{t("Admin Console")}</span>
                          </span>
                          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                            Admin
                          </span>
                        </Link>
                      )}
                    </div>

                    <div className="my-1 border-t border-border" />

                    <button
                      role="menuitem"
                      onClick={onSignOut}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-xs sm:text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
                    >
                      <SignOutIcon className="h-4 w-4" />
                      <span>{t("Sign out")}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link
                href="/login"
                className="rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-ink/80 transition-colors hover:bg-brand-soft/70 hover:text-ink"
              >
                {t("Log in")}
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_2px_10px_-2px_rgba(49,105,245,0.45)] transition-all duration-200 hover:bg-brand-dark hover:shadow-[0_4px_16px_-2px_rgba(49,105,245,0.6)] active:scale-[0.98]"
              >
                <span>{t("Sign up")}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12h14M13 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Action Cluster (< lg) */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:hidden flex-shrink-0">
          <LanguageSwitcher />

          {session && hasBalance && (
            <Link
              href="/account/wallet"
              className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/90 px-2.5 py-1.5 shadow-sm transition-all hover:border-brand/40 active:scale-95"
              dir="ltr"
              title={t("Wallet balance")}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success"></span>
              </span>
              <span className="font-mono text-xs font-bold text-ink">
                ${balance.toFixed(2)}
              </span>
            </Link>
          )}

          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-surface/90 text-ink shadow-sm transition-all hover:border-brand/40 hover:bg-brand-soft active:scale-95"
            aria-label={t("Toggle menu")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="transition-transform duration-200"
            >
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {open && (
        <div
          ref={mobileRef}
          className="border-t border-border/80 bg-surface/98 backdrop-blur-xl px-4 py-4 shadow-2xl lg:hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {session ? (
            <div className="mb-3 rounded-2xl border border-border/90 bg-gradient-to-br from-brand-soft/70 via-surface to-surface p-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand to-indigo-600 text-sm font-bold text-white shadow-sm">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted shadow-sm">
                      {isAdmin ? "⚡ " + t("Administrator") : "👤 " + t("Customer")}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-ink">{email}</div>
                </div>
              </div>

              {hasBalance && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-border/80 bg-surface/90 px-3 py-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
                      {t("Balance")}
                    </div>
                    <div className="font-mono text-sm font-bold text-ink" dir="ltr">
                      ${balance.toFixed(2)}
                    </div>
                  </div>
                  <Link
                    href="/account/wallet"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-dark"
                  >
                    <span>{t("Top up")}</span>
                    <span>→</span>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-3 rounded-2xl border border-border/90 bg-gradient-to-br from-brand-soft/50 via-surface to-surface p-3.5 text-center shadow-sm">
              <div className="text-sm font-bold text-ink">Welcome to {brandName}</div>
              <p className="mt-1 text-xs text-muted">
                Instant digital subscriptions, license keys, and AI tokens.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-semibold text-ink shadow-sm hover:bg-brand-soft"
                >
                  {t("Log in")}
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl bg-brand px-3 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-brand-dark"
                >
                  {t("Sign up")}
                </Link>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <ul className="space-y-1">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-brand-soft text-brand font-semibold shadow-[inset_0_0_0_1px_rgba(49,105,245,0.22)]"
                        : "text-ink hover:bg-brand-soft/60"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={active ? "text-brand" : "text-muted"}>{l.icon}</span>
                      <span>{l.label}</span>
                    </span>
                    {l.badge ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand ring-1 ring-brand/20">
                        {l.badge}
                      </span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-muted/60">
                        <path
                          d="M9 5l7 7-7 7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </Link>
                </li>
              );
            })}

            {isAdmin && (
              <li>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft/60"
                >
                  <span className="flex items-center gap-2.5">
                    <AdminIcon className="h-4 w-4 text-brand" />
                    <span>{t("Admin Console")}</span>
                  </span>
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                    Admin
                  </span>
                </Link>
              </li>
            )}

            {session && (
              <li className="pt-2 border-t border-border/80">
                <button
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-start text-sm font-medium text-danger hover:bg-danger-soft transition-colors"
                >
                  <SignOutIcon className="h-4 w-4" />
                  <span>{t("Sign out")}</span>
                </button>
              </li>
            )}
          </ul>

          {/* Trust reassurance banner in mobile menu */}
          <div className="mt-3 flex items-center justify-center gap-2 border-t border-border/60 pt-3 text-[10px] text-muted">
            <span>⚡ Instant Delivery</span>
            <span>·</span>
            <span>🔒 EVM Multi-Chain</span>
            <span>·</span>
            <span>24/7 VIP Support</span>
          </div>
        </div>
      )}
    </header>
  );
}
