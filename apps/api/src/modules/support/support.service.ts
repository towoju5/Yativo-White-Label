import type { PrismaClient } from "@prisma/client";
import type { CreateSupportTicketInput, SupportTicketStatus } from "@white-label/shared-types";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { getBranding } from "../branding/branding.service.js";
import { AppError, NotFoundError } from "../../lib/errors.js";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type TicketWithMessages = {
  id: string;
  customerId: string;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messages: { id: string; authorType: string; authorId: string; body: string; createdAt: Date }[];
};

function toListItemDto(t: { id: string; subject: string; status: string; createdAt: Date; updatedAt: Date; messages: { createdAt: Date }[] }) {
  const lastMessage = t.messages.at(-1);
  const lastMessageAt = lastMessage ? lastMessage.createdAt : t.createdAt;
  return { id: t.id, subject: t.subject, status: t.status as SupportTicketStatus, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), lastMessageAt: lastMessageAt.toISOString() };
}

async function messagesToDto(prisma: PrismaClient, ticket: TicketWithMessages) {
  const staffIds = [...new Set(ticket.messages.filter((m) => m.authorType === "STAFF").map((m) => m.authorId))];
  const staffUsers = staffIds.length > 0 ? await prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, email: true } }) : [];
  const staffNameById = new Map(staffUsers.map((s) => [s.id, s.email]));

  return ticket.messages.map((m) => ({
    id: m.id,
    authorType: m.authorType as "CUSTOMER" | "STAFF",
    authorName: m.authorType === "STAFF" ? (staffNameById.get(m.authorId) ?? "Support") : "You",
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));
}

/** Persists the ticket + first message, and forwards it to the support inbox exactly as before — nothing changes for how staff get paged, but now it's a real tracked thread rather than a one-way email. */
export async function submitSupportTicket(prisma: PrismaClient, customerId: string, input: CreateSupportTicketInput): Promise<{ id: string }> {
  const [customer, branding] = await Promise.all([prisma.customer.findUniqueOrThrow({ where: { id: customerId } }), getBranding(prisma)]);

  const ticket = await prisma.supportTicket.create({
    data: {
      customerId,
      subject: input.subject,
      messages: { create: { authorType: "CUSTOMER", authorId: customerId, body: input.message } },
    },
  });

  if (branding.supportEmail) {
    const name = customer.fullName ?? customer.businessName ?? customer.email;
    await enqueueEmail({
      to: branding.supportEmail,
      replyTo: customer.email,
      subject: `[Support #${ticket.id.slice(-6)}] ${input.subject}`,
      html: `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(customer.email)})</p><p><strong>Message:</strong></p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
    });
  }

  return { id: ticket.id };
}

export async function listMyTickets(prisma: PrismaClient, customerId: string) {
  const tickets = await prisma.supportTicket.findMany({
    where: { customerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, subject: true, status: true, createdAt: true, updatedAt: true, messages: { select: { createdAt: true }, orderBy: { createdAt: "asc" } } },
  });
  return tickets.map(toListItemDto);
}

async function getTicketOrThrow(prisma: PrismaClient, ticketId: string, customerId?: string): Promise<TicketWithMessages> {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, ...(customerId ? { customerId } : {}) },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new NotFoundError("Support ticket");
  return ticket;
}

export async function getMyTicket(prisma: PrismaClient, customerId: string, ticketId: string) {
  const ticket = await getTicketOrThrow(prisma, ticketId, customerId);
  return { ...toListItemDto(ticket), messages: await messagesToDto(prisma, ticket) };
}

export async function addCustomerReply(prisma: PrismaClient, customerId: string, ticketId: string, body: string) {
  const ticket = await getTicketOrThrow(prisma, ticketId, customerId);
  if (ticket.status === "CLOSED") throw new AppError("This ticket is closed — start a new one if you need further help.", 409, "TICKET_CLOSED");

  await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId, authorType: "CUSTOMER", authorId: customerId, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: ticket.status === "RESOLVED" ? "OPEN" : (ticket.status as SupportTicketStatus) } }),
  ]);

  const branding = await getBranding(prisma);
  if (branding.supportEmail) {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    await enqueueEmail({
      to: branding.supportEmail,
      replyTo: customer.email,
      subject: `[Support #${ticketId.slice(-6)}] ${ticket.subject}`,
      html: `<p><strong>Reply from:</strong> ${escapeHtml(customer.email)}</p><p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    });
  }

  return getMyTicket(prisma, customerId, ticketId);
}

// ── Admin ──

export async function listTicketsForAdmin(prisma: PrismaClient, status?: SupportTicketStatus) {
  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: "desc" },
    include: { customer: { select: { id: true, fullName: true, businessName: true, email: true } }, messages: { select: { createdAt: true }, orderBy: { createdAt: "asc" } } },
  });
  return tickets.map((t) => ({
    ...toListItemDto(t),
    customerId: t.customer.id,
    customerName: t.customer.fullName ?? t.customer.businessName ?? t.customer.email,
    customerEmail: t.customer.email,
  }));
}

export async function getTicketForAdmin(prisma: PrismaClient, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { customer: { select: { id: true, fullName: true, businessName: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new NotFoundError("Support ticket");
  return {
    ...toListItemDto(ticket),
    customerId: ticket.customer.id,
    customerName: ticket.customer.fullName ?? ticket.customer.businessName ?? ticket.customer.email,
    customerEmail: ticket.customer.email,
    messages: await messagesToDto(prisma, ticket),
  };
}

export async function addStaffReply(prisma: PrismaClient, staffId: string, ticketId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { customer: true } });
  if (!ticket) throw new NotFoundError("Support ticket");

  await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId, authorType: "STAFF", authorId: staffId, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS" } }),
  ]);

  const branding = await getBranding(prisma);
  await enqueueEmail({
    to: ticket.customer.email,
    replyTo: branding.supportEmail ?? undefined,
    subject: `Re: [Support #${ticketId.slice(-6)}] ${ticket.subject}`,
    html: `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="color:#6b7280;font-size:12px;">Reply to this email, or reply from the Support page in your account.</p>`,
  });

  return getTicketForAdmin(prisma, ticketId);
}

export async function updateTicketStatus(prisma: PrismaClient, ticketId: string, status: SupportTicketStatus) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Support ticket");
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  return getTicketForAdmin(prisma, ticketId);
}
