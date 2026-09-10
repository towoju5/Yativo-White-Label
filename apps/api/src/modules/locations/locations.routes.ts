import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import geoip from "geoip-lite";
import { countrySchema, detectedLanguageSchema } from "@white-label/shared-types";
import { yativoClient } from "../../lib/yativoClient.js";
import { languageForCountry } from "../../lib/countryToLanguage.js";

/** Public — no auth required, matching Yativo's own /locations/countries. Needed pre-signup, before a session exists. */
export async function locationsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get("/locations/countries", { schema: { response: { 200: z.array(countrySchema) } } }, async (_request, reply) => {
    const countries = await yativoClient.fiat.locations.listCountries();
    return reply.send(countries.map((c) => ({ name: c.name, iso2: c.iso2, iso3: c.iso3, callingCode: c.callingCode })));
  });

  // Used once per browser, before login, to pick a smarter default UI language than "en" when
  // the visitor's browser locale doesn't already match one of our supported languages — see
  // apps/web/src/i18n/index.ts. geoip-lite's bundled database is city/country-level and offline
  // (no outbound call per request), so this never depends on a third party being up.
  server.get("/locations/detect-language", { schema: { response: { 200: detectedLanguageSchema } } }, async (request, reply) => {
    const geo = geoip.lookup(request.ip);
    const country = geo?.country ?? null;
    return reply.send({ country, language: languageForCountry(country) });
  });
}
