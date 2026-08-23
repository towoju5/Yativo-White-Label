import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

const countrySchema = z
  .object({
    name: z.string(),
    iso2: z.string(),
    iso3: z.string(),
    calling_code: z.string(),
  })
  .passthrough();

export type FiatCountry = { name: string; iso2: string; iso3: string; callingCode: string };

const occupationCodeSchema = z.object({ code: z.string(), display_name: z.string() }).passthrough();
export type FiatOccupationCode = { code: string; displayName: string };

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function createLocationsResource(ctx: YativoContext) {
  return {
    async listCountries(): Promise<FiatCountry[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/locations/countries",
        method: "GET",
        schema: yativoEnvelope(z.array(countrySchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [{ name: "united states", iso2: "US", iso3: "USA", calling_code: "+1" }],
        },
      });
      return res.data.map((c) => ({ name: titleCase(c.name), iso2: c.iso2, iso3: c.iso3, callingCode: c.calling_code }));
    },

    async listOccupationCodes(): Promise<FiatOccupationCode[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/auth/occupation-codes",
        method: "GET",
        schema: yativoEnvelope(z.array(occupationCodeSchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [{ code: "151252", display_name: "Software developer" }],
        },
      });
      return res.data.map((o) => ({ code: o.code, displayName: o.display_name }));
    },
  };
}
