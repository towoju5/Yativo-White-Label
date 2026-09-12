import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { PortalPermission } from "@white-label/shared-types";
import {
  portalLoginSchema,
  createCustomerSchema,
  authTokensSchema,
  signupResultSchema,
  portalLoginResultSchema,
  verifyTwoFactorSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  requestMagicLinkSchema,
  verifyMagicLinkSchema,
  customerSchema,
  passkeyLoginOptionsResultSchema,
  verifyPasskeyLoginSchema,
} from "@white-label/shared-types";
import {
  signupCustomer,
  loginCustomer,
  verifyTwoFactorLogin,
  refreshCustomerSession,
  logoutCustomer,
  getCustomerPasskeyLoginOptions,
  verifyCustomerPasskeyLogin,
  verifyCustomerEmail,
  resendVerificationEmail,
  changeCustomerPassword,
  requestPasswordReset,
  resetPassword,
  requestMagicLink,
  verifyMagicLink,
} from "./portalAuth.service.js";
import { changePasswordSchema } from "@white-label/shared-types";
import { AppError } from "../../lib/errors.js";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { env } from "../../config/env.js";
import { parseTtlToMs } from "../../lib/refreshTokens.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";

const REFRESH_COOKIE = "portal_refresh_token";

function requestMeta(request: FastifyRequest): { ip: string; userAgent: string | undefined } {
  return { ip: request.ip, userAgent: request.headers["user-agent"] };
}

function toDto(customer: {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  fullName: string | null;
  businessName: string | null;
  email: string;
  emailVerifiedAt: Date | null;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  status: "ACTIVE" | "FROZEN";
  yativoCustomerId: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
}) {
  return { ...customer, emailVerifiedAt: customer.emailVerifiedAt?.toISOString() ?? null, createdAt: customer.createdAt.toISOString() };
}

function setRefreshCookie(reply: import("fastify").FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal/auth",
    maxAge: parseTtlToMs(env.PORTAL_JWT_REFRESH_TTL) / 1000,
  });
}

export async function portalAuthRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/portal/auth/signup",
    { schema: { body: createCustomerSchema, response: { 200: signupResultSchema } } },
    async (request, reply) => {
      const result = await signupCustomer(app.prisma, request.body, requestMeta(request));
      if (result.pendingVerification) {
        return reply.send({ pendingVerification: true });
      }
      setRefreshCookie(reply, result.refreshToken);
      return reply.send({ accessToken: result.accessToken });
    },
  );

  server.post(
    "/portal/auth/verify-email",
    { schema: { body: verifyEmailSchema, response: { 204: z.void(), 401: errorResponseSchema } } },
    async (request, reply) => {
      await verifyCustomerEmail(app.prisma, request.body.token);
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/auth/resend-verification",
    { schema: { body: resendVerificationSchema, response: { 204: z.void() } } },
    async (request, reply) => {
      await resendVerificationEmail(app.prisma, request.body.email);
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/auth/forgot-password",
    // Also throttled — an unthrottled version would let someone probe which emails have accounts
    // by timing, on top of just being spammable.
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } }, schema: { body: requestPasswordResetSchema, response: { 204: z.void() } } },
    async (request, reply) => {
      await requestPasswordReset(app.prisma, request.body.email);
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } }, schema: { body: resetPasswordSchema, response: { 204: z.void(), 401: errorResponseSchema } } },
    async (request, reply) => {
      await resetPassword(app.prisma, request.body.token, request.body.newPassword, requestMeta(request));
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/auth/magic-link/request",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } }, schema: { body: requestMagicLinkSchema, response: { 204: z.void() } } },
    async (request, reply) => {
      await requestMagicLink(app.prisma, request.body.email);
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/auth/magic-link/verify",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } }, schema: { body: verifyMagicLinkSchema, response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await verifyMagicLink(app.prisma, request.body.token, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      return reply.send({ accessToken });
    },
  );

  server.post(
    "/portal/auth/login",
    // Tighter than the global 200/min default (app.ts) — login is the one endpoint worth
    // throttling specifically against brute-forcing, independent of whatever else this IP is doing.
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } }, schema: { body: portalLoginSchema, response: { 200: portalLoginResultSchema } } },
    async (request, reply) => {
      const result = await loginCustomer(app.prisma, request.body.email, request.body.password, requestMeta(request));
      if (result.requiresTwoFactor) {
        return reply.send({ requiresTwoFactor: true, challengeToken: result.challengeToken });
      }
      setRefreshCookie(reply, result.refreshToken);
      return reply.send({ accessToken: result.accessToken });
    },
  );

  server.post(
    "/portal/auth/2fa/verify",
    // A 6-digit TOTP code is guessable at a high enough request rate without this — tighter than
    // login itself since there's no password to also get right first.
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } }, schema: { body: verifyTwoFactorSchema, response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await verifyTwoFactorLogin(app.prisma, request.body.challengeToken, request.body.code, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      return reply.send({ accessToken });
    },
  );

  server.post(
    "/portal/auth/passkey/login/options",
    { schema: { response: { 200: passkeyLoginOptionsResultSchema } } },
    async (_request, reply) => {
      const result = await getCustomerPasskeyLoginOptions(app.redis);
      return reply.send({ flowId: result.flowId, options: result.options as unknown as Record<string, unknown> });
    },
  );

  server.post(
    "/portal/auth/passkey/login/verify",
    { schema: { body: verifyPasskeyLoginSchema, response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await verifyCustomerPasskeyLogin(
        app.prisma,
        app.redis,
        request.body.flowId,
        request.body.response as unknown as AuthenticationResponseJSON,
        requestMeta(request),
      );
      setRefreshCookie(reply, refreshToken);
      return reply.send({ accessToken });
    },
  );

  server.post(
    "/portal/auth/refresh",
    { schema: { response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE];
      if (!refreshToken) return reply.code(401).send({ message: "Missing refresh token" });
      const { accessToken, refreshToken: newRefreshToken } = await refreshCustomerSession(app.prisma, refreshToken, requestMeta(request));
      setRefreshCookie(reply, newRefreshToken);
      return reply.send({ accessToken });
    },
  );

  server.post("/portal/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) await logoutCustomer(app.prisma, refreshToken);
    reply.clearCookie(REFRESH_COOKIE, { path: "/portal/auth" });
    return reply.code(204).send();
  });

  server.post(
    "/portal/auth/change-password",
    {
      preHandler: requireCustomerAuth,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: changePasswordSchema, response: { 204: z.void(), 401: errorResponseSchema } },
    },
    async (request, reply) => {
      // Team-member logins have their own passwordHash on a different table (CustomerTeamMember)
      // — not supported by this route, which only ever touches Customer.passwordHash.
      if (request.customer!.principalType === "member") {
        throw new AppError("Password changes for team members aren't supported yet — contact your business administrator.", 400, "NOT_SUPPORTED");
      }
      await changeCustomerPassword(app.prisma, request.customer!.sub, request.body.currentPassword, request.body.newPassword, requestMeta(request));
      reply.clearCookie(REFRESH_COOKIE, { path: "/portal/auth" });
      return reply.code(204).send();
    },
  );

  server.get(
    "/portal/auth/me",
    { preHandler: requireCustomerAuth, schema: { response: { 200: customerSchema } } },
    async (request, reply) => {
      const claims = request.customer!;
      const businessCustomerId = resolveEffectiveCustomerId(claims);
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: businessCustomerId } });

      if (claims.principalType === "member") {
        const member = await app.prisma.customerTeamMember.findUniqueOrThrow({ where: { id: claims.sub } });
        return reply.send({
          ...toDto(customer),
          principalType: "member",
          permissions: (claims.permissions ?? []) as PortalPermission[],
          memberEmail: member.email,
          memberFullName: member.fullName,
        });
      }
      return reply.send({ ...toDto(customer), principalType: "owner" });
    },
  );
}
