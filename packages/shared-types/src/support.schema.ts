import { z } from "zod";

export const createSupportTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(10_000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
