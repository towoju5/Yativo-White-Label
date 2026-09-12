import type { FastifyInstance } from "fastify";
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
} from "./portalAuth.service.js";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { env } from "../../config/env.js";
import { parseTtlToMs } from "../../lib/refreshTokens.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";

const REFRESH_COOKIE = "portal_refresh_token";

function toDto(customer: {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  fullName: string | null;
  businessName: string | null;
  email: string;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  status: "ACTIVE" | "FROZEN";
  yativoCustomerId: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
}) {
  return { ...customer, createdAt: customer.createdAt.toISOString() };
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
      const result = await signupCustomer(app.prisma, request.body);
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
    "/portal/auth/login",
    { schema: { body: portalLoginSchema, response: { 200: portalLoginResultSchema } } },
    async (request, reply) => {
      const result = await loginCustomer(app.prisma, request.body.email, request.body.password);
      if (result.requiresTwoFactor) {
        return reply.send({ requiresTwoFactor: true, challengeToken: result.challengeToken });
      }
      setRefreshCookie(reply, result.refreshToken);
      return reply.send({ accessToken: result.accessToken });
    },
  );

  server.post(
    "/portal/auth/2fa/verify",
    { schema: { body: verifyTwoFactorSchema, response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await verifyTwoFactorLogin(app.prisma, request.body.challengeToken, request.body.code);
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
      const { accessToken, refreshToken: newRefreshToken } = await refreshCustomerSession(app.prisma, refreshToken);
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
