import { useCallback } from "react";
import { useRouter } from "next/router";
import dictionaries from "../locales";

// Translation helper. English text IS the key: t("Sign up"). If a
// translation is missing the English text is shown, so nothing ever
// breaks while translations are being added.
//
//   const { t, locale } = useT();
//   t("Sign up")
//   t("Hello {name}", { name })     // {placeholders} are filled in
//
// To add or fix a translation, edit /locales/parts/*.js — no database,
// no API, so it costs nothing on free Vercel/Supabase.

export const LOCALES = [
  { code: "en", label: "English", native: "English", short: "EN" },
  { code: "ar", label: "Arabic", native: "العربية", short: "AR" },
  { code: "ru", label: "Russian", native: "Русский", short: "RU" },
];

export const isRTL = (locale) => locale === "ar";

// BCP-47 tag for Intl/toLocale*String. Arabic uses Latin digits so prices
// and dates look the same in every language.
export const intlLocale = (locale) =>
  ({ en: "en-US", ar: "ar-u-nu-latn", ru: "ru-RU" }[locale] || "en-US");

export function translate(locale, text, vars) {
  let out = (dictionaries[locale] && dictionaries[locale][text]) || text;
  if (vars) {
    out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  }
  return out;
}

export function useT() {
  const { locale = "en" } = useRouter();
  const t = useCallback((text, vars) => translate(locale, text, vars), [locale]);
  return { t, locale, dir: isRTL(locale) ? "rtl" : "ltr" };
}
