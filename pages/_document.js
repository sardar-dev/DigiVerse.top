import { Html, Head, Main, NextScript } from "next/document";

// Sets <html lang> and dir (Arabic = right-to-left) from the active locale.
export default function Document(props) {
  const locale = props.__NEXT_DATA__?.locale || "en";
  return (
    <Html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
