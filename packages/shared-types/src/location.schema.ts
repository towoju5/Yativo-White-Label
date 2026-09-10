import { z } from "zod";

export const countrySchema = z.object({
  name: z.string(),
  iso2: z.string(),
  iso3: z.string(),
  callingCode: z.string(),
});
export type Country = z.infer<typeof countrySchema>;

export const detectedLanguageSchema = z.object({
  /** ISO2 country guessed from the request's IP, or null if it couldn't be resolved (e.g. localhost, private IP ranges). */
  country: z.string().nullable(),
  /** One of the web app's supported locale codes, or null if the country has no mapped language — caller should keep its own default (e.g. "en"). */
  language: z.string().nullable(),
});
export type DetectedLanguage = z.infer<typeof detectedLanguageSchema>;
