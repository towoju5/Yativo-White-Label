import { z } from "zod";

export const createSupportTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(10_000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const SUPPORT_TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const supportTicketStatusSchema = z.enum(SUPPORT_TICKET_STATUSES);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

export const SUPPORT_TICKET_AUTHOR_TYPES = ["CUSTOMER", "STAFF"] as const;
export const supportTicketAuthorTypeSchema = z.enum(SUPPORT_TICKET_AUTHOR_TYPES);
export type SupportTicketAuthorType = z.infer<typeof supportTicketAuthorTypeSchema>;

export const supportTicketMessageSchema = z.object({
  id: z.string(),
  authorType: supportTicketAuthorTypeSchema,
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type SupportTicketMessageDto = z.infer<typeof supportTicketMessageSchema>;

export const supportTicketListItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: supportTicketStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastMessageAt: z.string(),
});
export type SupportTicketListItem = z.infer<typeof supportTicketListItemSchema>;

export const supportTicketDetailSchema = supportTicketListItemSchema.extend({
  messages: z.array(supportTicketMessageSchema),
});
export type SupportTicketDetail = z.infer<typeof supportTicketDetailSchema>;

export const addSupportTicketMessageSchema = z.object({
  body: z.string().min(1).max(10_000),
});
export type AddSupportTicketMessageInput = z.infer<typeof addSupportTicketMessageSchema>;

export const updateSupportTicketStatusSchema = z.object({
  status: supportTicketStatusSchema,
});
export type UpdateSupportTicketStatusInput = z.infer<typeof updateSupportTicketStatusSchema>;

// ── Admin ──

export const adminSupportTicketListItemSchema = supportTicketListItemSchema.extend({
  customerId: z.string(),
  customerName: z.string(),
  customerEmail: z.string(),
});
export type AdminSupportTicketListItem = z.infer<typeof adminSupportTicketListItemSchema>;

export const adminSupportTicketDetailSchema = adminSupportTicketListItemSchema.extend({
  messages: z.array(supportTicketMessageSchema),
});
export type AdminSupportTicketDetail = z.infer<typeof adminSupportTicketDetailSchema>;
