import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { SITE_NAME } from "../../lib/siteConfig";
import { supabase } from "../../lib/supabaseClient";

// Shared storefront/account header. Pages that already track auth pass
// `session` / `balance` / `onSignOut` in (no extra requests). If a prop
// is omitted (e.g. Terms, Privacy, 404) the header loads it itself —
// one local getSession plus, when logged in, one small balance query.
export default function SiteHeader({
  session: sessionProp,
  balance: balanceProp,
  onSignOut: onSignOutProp,
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false); // mobile drawer
  const [menu, setMenu] = useState(false); // account dropdown
  const menuRef = useRef(null);
  const [ownSession, setOwnSession] = useState(undefined);
  const [ownBalance, setOwnBalance] = useState(undefined);

  const needSession = sessionProp === undefined;
  const needBalance = balanceProp === undefined;
  const userId = sessionProp?.user?.id;

  useEffect(() => {
    if (!needSession && !needBalance) return;
    let cancelled = false;
    (async () => {
      let sess = sessionProp;
      if (needSession) {
        const { data } = await supabase.auth.getSession();
        sess = data.session;
        if (!cancelled) setOwnSession(sess);
      }
      if (sess && needBalance) {
        const { data } = await supabase.from("profiles").select("balance").eq("id", sess.user.id).single();
        if (!cancelled) setOwnBalance(Number(data?.balance || 0));
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
      window.location.href = "/";
    });

  const links = session
    ? [
        { href: "/", label: "Store" },
        { href: "/account/wallet", label: "Wallet" },
        { href: "/account/orders", label: "My Orders" },
        { href: "/account/support", label: "Support" },
      ]
    : [{ href: "/", label: "Store" }];

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
    if (!menu) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${brandName} home`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-light to-brand-dark shadow-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2.5l2.4 6.1 6.1 2.4-6.1 2.4L12 19.5l-2.4-6.1-6.1-2.4 6.1-2.4L12 2.5z"
                fill="#fff"
              />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink">{brandName}</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                isActive(l.href)
                  ? "bg-brand-soft text-brand"
                  : "text-muted hover:bg-brand-soft hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {session ? (
            <>
              {hasBalance && (
                <Link
                  href="/account/wallet"
                  className="rounded-full border border-border bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:border-brand/40"
                  title="Wallet balance"
                >
                  ${balance.toFixed(2)}
                </Link>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenu((m) => !m)}
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  aria-label="Account menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white ring-2 ring-transparent transition-shadow hover:ring-brand/30 focus:outline-none focus-visible:ring-brand/50"
                >
                  {initial}
                </button>
                {menu && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-card-hover"
                  >
                    <div className="border-b border-border px-4 py-3">
                      <div className="text-xs text-muted">Signed in as</div>
                      <div className="truncate text-sm font-medium text-ink">{email}</div>
                      {hasBalance && (
                        <div className="mt-1 text-xs text-muted">
                          Balance <span className="font-semibold text-ink">${balance.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-1.5 text-sm">
                      <Link role="menuitem" href="/account/wallet" className="block rounded-lg px-3 py-2 text-ink hover:bg-brand-soft">
                        Wallet &amp; top-up
                      </Link>
                      <Link role="menuitem" href="/account/orders" className="block rounded-lg px-3 py-2 text-ink hover:bg-brand-soft">
                        My orders
                      </Link>
                      <button
                        role="menuitem"
                        onClick={onSignOut}
                        className="block w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-danger-soft"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg border-b-[3px] border-brand-dark bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 active:translate-y-[2px] active:border-b"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {session && hasBalance && (
            <Link
              href="/account/wallet"
              className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"
            >
              ${balance.toFixed(2)}
            </Link>
          )}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-brand-soft"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border bg-surface px-4 py-3 md:hidden">
          {session && (
            <div className="mb-2 flex items-center gap-3 rounded-xl bg-brand-soft px-3 py-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                {initial}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{email}</div>
                {hasBalance && <div className="text-xs text-muted">Balance ${balance.toFixed(2)}</div>}
              </div>
            </div>
          )}
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive(l.href) ? "bg-brand-soft text-brand" : "text-ink hover:bg-brand-soft"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="pt-1">
              {session ? (
                <button
                  onClick={onSignOut}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger-soft"
                >
                  Sign out
                </button>
              ) : (
                <div className="flex gap-2 py-1">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg border border-border px-3 py-2.5 text-center text-sm font-medium text-ink"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg bg-brand px-3 py-2.5 text-center text-sm font-medium text-white"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
