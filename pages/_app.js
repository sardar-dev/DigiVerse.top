import "../styles/globals.css";
import { useEffect } from "react";
import { useRouter } from "next/router";
import WhatsAppButton from "../components/WhatsAppButton";
import NoticePopup from "../components/NoticePopup";
import ToastContainer from "../components/ui/Toast";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isAdmin = router.pathname.startsWith("/admin");

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
  return (
    <>
      <Component {...pageProps} />
      {!isAdmin && <WhatsAppButton />}
      {!isAdmin && <NoticePopup />}
      <ToastContainer />
    </>
  );
}
