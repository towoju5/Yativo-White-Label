import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { portalLoginSchema, createCustomerSchema, authTokensSchema, portalLoginResultSchema, verifyTwoFactorSchema, customerSchema } from "@white-label/shared-types";
import { signupCustomer, loginCustomer, verifyTwoFactorLogin, refreshCustomerSession, logoutCustomer } from "./portalAuth.service.js";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { env } from "../../config/env.js";
import { parseTtlToMs } from "../../lib/refreshTokens.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";

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
    { schema: { body: createCustomerSchema, response: { 200: authTokensSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await signupCustomer(app.prisma, request.body);
      setRefreshCookie(reply, refreshToken);
      return reply.send({ accessToken });
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
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      return reply.send(toDto(customer));
    },
  );
}
