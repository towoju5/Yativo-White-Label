/**
 * Best-effort ISO2 country → one of the web app's 15 supported locales (see
 * apps/web/src/i18n/index.ts SUPPORTED_LANGUAGES — kept in sync manually since this is the only
 * consumer). Deliberately not exhaustive: a country left out just falls back to "en" rather than
 * guessing wrong for a genuinely mixed-language or ambiguous market (e.g. Canada, Singapore,
 * Ukraine, Switzerland's French/Italian-speaking regions).
 */
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  ES: "es", MX: "es", AR: "es", CO: "es", PE: "es", VE: "es", CL: "es", EC: "es",
  GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es",
  CR: "es", PA: "es", UY: "es", PR: "es", GQ: "es",

  FR: "fr", BE: "fr", LU: "fr", MC: "fr", SN: "fr", CI: "fr", ML: "fr", BF: "fr",
  NE: "fr", TG: "fr", BJ: "fr", CD: "fr", CG: "fr", GA: "fr", HT: "fr",

  DE: "de", AT: "de", CH: "de", LI: "de",

  PT: "pt", BR: "pt", AO: "pt", MZ: "pt", GW: "pt", CV: "pt", ST: "pt", TL: "pt",

  IT: "it", SM: "it", VA: "it",

  NL: "nl", SR: "nl",

  PL: "pl",

  RU: "ru", BY: "ru", KZ: "ru", KG: "ru",

  TR: "tr",

  SA: "ar", AE: "ar", EG: "ar", MA: "ar", DZ: "ar", TN: "ar", IQ: "ar", JO: "ar",
  KW: "ar", QA: "ar", BH: "ar", OM: "ar", YE: "ar", LY: "ar", SD: "ar", LB: "ar",
  PS: "ar", SY: "ar",

  CN: "zh", TW: "zh", HK: "zh", MO: "zh",

  JP: "ja",

  KR: "ko", KP: "ko",

  NG: "ng",
};

/** Returns a supported locale code for the given ISO2 country, or null if none is mapped (caller should fall back to their own default, e.g. "en"). */
export function languageForCountry(iso2: string | null | undefined): string | null {
  if (!iso2) return null;
  return COUNTRY_TO_LANGUAGE[iso2.toUpperCase()] ?? null;
}
