import type { PrismaClient } from "@prisma/client";
import type { CreateSupportTicketInput } from "@white-label/shared-types";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { getBranding } from "../branding/branding.service.js";
import { AppError } from "../../lib/errors.js";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Lightweight "ticket by email" — forwards the customer's message to the platform's configured support inbox, with reply-to set to the customer so support can just hit reply. */
export async function submitSupportTicket(prisma: PrismaClient, customerId: string, input: CreateSupportTicketInput): Promise<void> {
  const [customer, branding] = await Promise.all([prisma.customer.findUniqueOrThrow({ where: { id: customerId } }), getBranding(prisma)]);

  if (!branding.supportEmail) {
    throw new AppError("Support isn't configured for this platform yet — no support email is set.", 409, "SUPPORT_EMAIL_NOT_CONFIGURED");
  }

  const name = customer.fullName ?? customer.businessName ?? customer.email;
  await enqueueEmail({
    to: branding.supportEmail,
    replyTo: customer.email,
    subject: `[Support] ${input.subject}`,
    html: `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(customer.email)})</p><p><strong>Message:</strong></p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
  });
}
