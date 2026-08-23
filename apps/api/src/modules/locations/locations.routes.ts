import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { countrySchema } from "@white-label/shared-types";
import { yativoClient } from "../../lib/yativoClient.js";

/** Public — no auth required, matching Yativo's own /locations/countries. Needed pre-signup, before a session exists. */
export async function locationsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get("/locations/countries", { schema: { response: { 200: z.array(countrySchema) } } }, async (_request, reply) => {
    const countries = await yativoClient.fiat.locations.listCountries();
    return reply.send(countries.map((c) => ({ name: c.name, iso2: c.iso2, iso3: c.iso3, callingCode: c.callingCode })));
  });
}
