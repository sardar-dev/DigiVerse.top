import "../styles/globals.css";
import { useEffect } from "react";
import { useRouter } from "next/router";
import Script from "next/script";
import WhatsAppButton from "../components/WhatsAppButton";
import NoticePopup from "../components/NoticePopup";
import ToastContainer from "../components/ui/Toast";
import * as fpixel from "../lib/fpixel";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isAdmin = router.pathname.startsWith("/admin");

  // Track page views on route changes (client-side SPA navigation)
  useEffect(() => {
    fpixel.pageview();

    const handleRouteChange = () => {
      fpixel.pageview();
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  // Returning visitor who chose Arabic/Russian before: open the site in it.
  useEffect(() => {
    if (isAdmin) return;
    try {
      const saved = localStorage.getItem("lang");
      if (saved && saved !== router.locale && ["en", "ar", "ru"].includes(saved)) {
        router.replace(router.asPath, router.asPath, { locale: saved });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global Referral Tracker: Capture ?ref= from ANY landing URL and persist it across site navigation
  useEffect(() => {
    let refParam = router.query.ref;
    if (!refParam && typeof window !== "undefined") {
      try {
        refParam = new URLSearchParams(window.location.search).get("ref");
      } catch {}
    }
    if (refParam && typeof refParam === "string") {
      const cleanRef = refParam.trim().replace(/^@+/, "");
      if (cleanRef) {
        try {
          localStorage.setItem("dg_ref_inviter", cleanRef);
          document.cookie = `dg_ref_inviter=${encodeURIComponent(cleanRef)}; path=/; max-age=2592000; SameSite=Lax`;
        } catch {}
      }
    }
  }, [router.isReady, router.query.ref]);

  return (
    <>
      {/* Global Meta Pixel (Facebook) Script */}
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${fpixel.FB_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <Component {...pageProps} />
      {!isAdmin && <WhatsAppButton />}
      {!isAdmin && <NoticePopup />}
      <ToastContainer />
    </>
  );
}
