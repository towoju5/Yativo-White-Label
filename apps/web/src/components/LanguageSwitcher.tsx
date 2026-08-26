import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  tr: "Türkçe",
  ar: "العربية",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ng: "Pidgin",
};

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  pt: "🇵🇹",
  it: "🇮🇹",
  nl: "🇳🇱",
  pl: "🇵🇱",
  ru: "🇷🇺",
  tr: "🇹🇷",
  ar: "🇸🇦",
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  ng: "🇳🇬"
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language in LANGUAGE_LABELS ? i18n.language : "en") as SupportedLanguage;

  return (
    <Select value={current} onValueChange={(value) => i18n.changeLanguage(value)}>
      <SelectTrigger className="w-[150px]">
        <SelectValue>
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{LANGUAGE_FLAGS[current]}</span>
            {LANGUAGE_LABELS[current]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((code) => (
          <SelectItem key={code} value={code}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{LANGUAGE_FLAGS[code]}</span>
              {LANGUAGE_LABELS[code]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
