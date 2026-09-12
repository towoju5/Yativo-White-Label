import { ZodError } from "zod";

/** ZodError's own `.message` is a raw JSON dump of every issue — fine for logs, unreadable in an
 * admin UI. Renders each issue as one plain-English line instead, e.g. `status: Invalid enum
 * value. Expected 'pending' | ... , received 'success' (at "status")`. */
export function formatZodError(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

export function describeError(err: unknown): string {
  if (err instanceof ZodError) return formatZodError(err);
  return err instanceof Error ? err.message : String(err);
}
