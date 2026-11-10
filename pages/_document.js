import { Html, Head, Main, NextScript } from "next/document";
import { FB_PIXEL_ID } from "../lib/fpixel";

// Sets <html lang> and dir (Arabic = right-to-left) from the active locale.
export default function Document(props) {
  const locale = props.__NEXT_DATA__?.locale || "en";
  return (
    <Html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <Head />
      <body>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
