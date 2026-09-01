import type { CustomerTeamMember, PrismaClient } from "@prisma/client";
import { PORTAL_PERMISSIONS, type CustomerTeamMemberDto, type InviteTeamMemberInput, type UpdateTeamMemberInput } from "@white-label/shared-types";
import { generateRefreshToken, hashRefreshToken } from "../../lib/refreshTokens.js";
import { hashPassword } from "../../lib/passwords.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { env } from "../../config/env.js";
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function memberToDto(member: CustomerTeamMember): CustomerTeamMemberDto {
  return {
    id: member.id,
    email: member.email,
    fullName: member.fullName,
    role: member.role,
    // ADMIN's effective set is everything, regardless of what's stored in `permissions` — same
    // bypass shown to the JWT (see issueMemberSession in portalAuth.service.ts).
    permissions: member.role === "ADMIN" ? [...PORTAL_PERMISSIONS] : (member.permissions as CustomerTeamMemberDto["permissions"]),
    isActive: member.isActive,
    invitedAt: member.invitedAt.toISOString(),
    acceptedAt: member.acceptedAt ? member.acceptedAt.toISOString() : null,
    createdAt: member.createdAt.toISOString(),
  };
}

export async function listTeamMembers(prisma: PrismaClient, businessCustomerId: string): Promise<CustomerTeamMemberDto[]> {
  const members = await prisma.customerTeamMember.findMany({ where: { businessCustomerId }, orderBy: { createdAt: "asc" } });
  return members.map(memberToDto);
}

export async function inviteTeamMember(
  prisma: PrismaClient,
  businessCustomerId: string,
  invitedById: string,
  businessDisplayName: string,
  input: InviteTeamMemberInput,
): Promise<CustomerTeamMemberDto> {
  const [existingMember, existingCustomer] = await Promise.all([
    prisma.customerTeamMember.findUnique({ where: { email: input.email } }),
    prisma.customer.findUnique({ where: { email: input.email } }),
  ]);
  if (existingMember || existingCustomer) throw new ConflictError("Someone with this email already has an account or a pending invite");

  const { token, tokenHash } = generateRefreshToken();
  const member = await prisma.customerTeamMember.create({
    data: {
      businessCustomerId,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      permissions: input.permissions,
      invitedById,
      inviteTokenHash: tokenHash,
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const acceptUrl = `${env.WEB_APP_URL}/portal/accept-invite?token=${token}`;
  await enqueueEmail({
    to: input.email,
    subject: `You've been invited to join ${businessDisplayName}'s team`,
    html: `<p>Hi ${input.fullName},</p><p>You've been invited to join ${businessDisplayName}'s team. <a href="${acceptUrl}">Accept your invite</a> to set a password and get started. This link expires in 7 days.</p>`,
  });

  return memberToDto(member);
}

export async function updateTeamMember(prisma: PrismaClient, businessCustomerId: string, memberId: string, input: UpdateTeamMemberInput): Promise<CustomerTeamMemberDto> {
  const member = await prisma.customerTeamMember.findFirst({ where: { id: memberId, businessCustomerId } });
  if (!member) throw new NotFoundError("Team member");
  const updated = await prisma.customerTeamMember.update({
    where: { id: memberId },
    data: { role: input.role, permissions: input.permissions },
  });
  return memberToDto(updated);
}

export async function setTeamMemberActive(prisma: PrismaClient, businessCustomerId: string, memberId: string, isActive: boolean): Promise<CustomerTeamMemberDto> {
  const member = await prisma.customerTeamMember.findFirst({ where: { id: memberId, businessCustomerId } });
  if (!member) throw new NotFoundError("Team member");
  const updated = await prisma.customerTeamMember.update({
    where: { id: memberId },
    data: { isActive, deactivatedAt: isActive ? null : new Date() },
  });
  if (!isActive) {
    await prisma.customerTeamRefreshToken.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  return memberToDto(updated);
}

export async function deleteTeamMember(prisma: PrismaClient, businessCustomerId: string, memberId: string): Promise<void> {
  const member = await prisma.customerTeamMember.findFirst({ where: { id: memberId, businessCustomerId } });
  if (!member) throw new NotFoundError("Team member");
  await prisma.customerTeamMember.delete({ where: { id: memberId } });
}

export async function acceptTeamInvite(prisma: PrismaClient, token: string, password: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  const member = await prisma.customerTeamMember.findUnique({ where: { inviteTokenHash: tokenHash } });
  if (!member || !member.inviteExpiresAt || member.inviteExpiresAt < new Date()) {
    throw new UnauthorizedError("This invite link is invalid or has expired");
  }
  if (!member.isActive) throw new AppError("This invite has been revoked", 410, "INVITE_REVOKED");

  const passwordHash = await hashPassword(password);
  await prisma.customerTeamMember.update({
    where: { id: member.id },
    data: { passwordHash, acceptedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
  });
}
