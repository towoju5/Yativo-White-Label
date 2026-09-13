import { z } from "zod";
import { CUSTOMER_IMPORT_STATUSES } from "./enums.js";

/** One row per "Import from Yativo" run — see POST /admin/customers/import-from-yativo and GET /admin/customers/import-runs. */
export const customerImportRunSchema = z.object({
  id: z.string(),
  status: z.enum(CUSTOMER_IMPORT_STATUSES),
  totalFetched: z.number().int(),
  imported: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  error: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type CustomerImportRun = z.infer<typeof customerImportRunSchema>;
