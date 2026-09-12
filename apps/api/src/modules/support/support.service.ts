import type { PrismaClient } from "@prisma/client";
import type { CreateSupportTicketInput, SupportTicketStatus } from "@white-label/shared-types";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { getBranding } from "../branding/branding.service.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { publishSupportTicketMessage, isTicketSidePresent } from "../../lib/realtime.js";
import { sendOpsAlert } from "../notifications/channels/opsAlert.js";
import { sendWebPush } from "../notifications/channels/webPush.js";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type NewMessage = { id: string; authorType: "CUSTOMER" | "STAFF"; authorName: string; body: string; createdAt: Date };

/**
 * Pushes a new message out over the realtime WS channel for instant delivery, and falls back to
 * an actual notification only when the OTHER side isn't currently watching this ticket (see
 * TicketSide/markTicketPresence in realtime.ts) — no point paging someone who's already looking
 * at the conversation. Customer messages alert the ops channels (Slack/Telegram, already wired up
 * for other events); staff replies push to the customer's own devices via the same web-push
 * channel notifications already use elsewhere. Never throws — a notification failure must never
 * fail the reply that triggered it.
 */
async function notifyNewTicketMessage(
  prisma: PrismaClient,
  ticket: { id: string; subject: string; customerId: string },
  message: NewMessage,
  status: SupportTicketStatus,
): Promise<void> {
  try {
    await publishSupportTicketMessage({
      type: "support-ticket.message",
      ticketId: ticket.id,
      message: { id: message.id, authorType: message.authorType, authorName: message.authorName, body: message.body, createdAt: message.createdAt.toISOString() },
      status,
    });

    const recipientSide = message.authorType === "CUSTOMER" ? "staff" : "customer";
    const recipientPresent = await isTicketSidePresent(ticket.id, recipientSide);
    if (recipientPresent) return;

    const preview = message.body.length > 140 ? `${message.body.slice(0, 140)}…` : message.body;
    if (message.authorType === "CUSTOMER") {
      await sendOpsAlert(`💬 New support message on "${ticket.subject}" (#${ticket.id.slice(-6)}): ${preview}`);
    } else {
      await sendWebPush(prisma, ticket.customerId, { title: `Support reply: ${ticket.subject}`, body: preview });
    }
  } catch (err) {
    // Deliberately swallowed — see doc comment above. Logged via the individual channel helpers
    // themselves (sendOpsAlert/sendWebPush already log internally), nothing further needed here.
    void err;
  }
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
    include: { messages: true },
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

  const firstMessage = ticket.messages[0]!;
  await notifyNewTicketMessage(prisma, ticket, { id: firstMessage.id, authorType: "CUSTOMER", authorName: "You", body: input.message, createdAt: firstMessage.createdAt }, "OPEN");

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

  const nextStatus: SupportTicketStatus = ticket.status === "RESOLVED" ? "OPEN" : (ticket.status as SupportTicketStatus);
  const [message] = await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId, authorType: "CUSTOMER", authorId: customerId, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: nextStatus } }),
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

  await notifyNewTicketMessage(prisma, ticket, { id: message.id, authorType: "CUSTOMER", authorName: "You", body, createdAt: message.createdAt }, nextStatus);

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

  const [message] = await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId, authorType: "STAFF", authorId: staffId, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS" } }),
  ]);

  const [branding, staffUser] = await Promise.all([getBranding(prisma), prisma.staffUser.findUnique({ where: { id: staffId }, select: { email: true } })]);
  await enqueueEmail({
    to: ticket.customer.email,
    replyTo: branding.supportEmail ?? undefined,
    subject: `Re: [Support #${ticketId.slice(-6)}] ${ticket.subject}`,
    html: `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="color:#6b7280;font-size:12px;">Reply to this email, or reply from the Support page in your account.</p>`,
  });

  await notifyNewTicketMessage(prisma, ticket, { id: message.id, authorType: "STAFF", authorName: staffUser?.email ?? "Support", body, createdAt: message.createdAt }, "IN_PROGRESS");

  return getTicketForAdmin(prisma, ticketId);
}

export async function updateTicketStatus(prisma: PrismaClient, ticketId: string, status: SupportTicketStatus) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Support ticket");
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  return getTicketForAdmin(prisma, ticketId);
}
