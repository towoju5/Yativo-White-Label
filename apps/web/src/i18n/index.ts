import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";
import ar from "./locales/ar.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import ng from "./locales/ng.json";

export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "pt", "it", "nl", "pl", "ru", "tr", "ar", "zh", "ja", "ko", "ng"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const RTL_LANGUAGES: SupportedLanguage[] = ["ar"];

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  nl: { translation: nl },
  pl: { translation: pl },
  ru: { translation: ru },
  tr: { translation: tr },
  ar: { translation: ar },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
  ng: { translation: ng },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    debug: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag", "querystring"],
      caches: ["localStorage"],
      lookupLocalStorage: "wl-language",
      lookupQuerystring: "lang",
    },
    react: { useSuspense: false },
  });

function applyDocumentDirection(language: string) {
  const isRtl = RTL_LANGUAGES.includes(language as SupportedLanguage);
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  document.documentElement.lang = language;
}

applyDocumentDirection(i18n.language);
i18n.on("languageChanged", applyDocumentDirection);

export default i18n;
