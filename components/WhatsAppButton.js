import { useEffect, useState } from "react";

export default function WhatsAppButton() {
  const [link, setLink] = useState("");
  const [type, setType] = useState("whatsapp");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setLink(d.whatsapp_link || "");
        setType(d.channel_type === "telegram" ? "telegram" : "whatsapp");
      })
      .catch(() => {});
  }, []);

  if (!link) return null;
  const tg = type === "telegram";

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={tg ? "Join our Telegram channel" : "Join our WhatsApp channel"}
      className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 flex items-center gap-2 rounded-full ${tg ? "bg-[#229ED9]" : "bg-[#25D366]"} px-4 py-3 text-white shadow-card-hover transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tg ? "focus-visible:outline-[#229ED9]" : "focus-visible:outline-[#25D366]"}`}
    >
      {tg ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.5 1.9 12c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.6.2 1.5 1.2z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.4 0-.5C11 9.2 10.5 8 10.3 7.5c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.2 1.8 2.7 4.3 3.8.6.3 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.1.2-1.3-.1-.1-.3-.2-.5-.3z" />
          <path d="M12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3C8.5 21.5 10.2 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3C4 15 3.5 13.5 3.5 12 3.5 7.3 7.3 3.5 12 3.5S20.5 7.3 20.5 12 16.7 20.2 12 20.2z" />
        </svg>
      )}
      <span className="hidden text-sm font-medium sm:inline">Join our {tg ? "Telegram" : "WhatsApp"}</span>
    </a>
  );
}
