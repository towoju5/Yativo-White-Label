import { z } from "zod";

export const countrySchema = z.object({
  name: z.string(),
  iso2: z.string(),
  iso3: z.string(),
  callingCode: z.string(),
});
export type Country = z.infer<typeof countrySchema>;
