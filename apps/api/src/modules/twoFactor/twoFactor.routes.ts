import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  twoFactorStatusSchema,
  twoFactorSetupResultSchema,
  enableTwoFactorSchema,
  enableTwoFactorResultSchema,
  disableTwoFactorSchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { getTwoFactorStatus, startTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor } from "./twoFactor.service.js";

export async function twoFactorRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/2fa/status",
    { preHandler: requireCustomerAuth, schema: { response: { 200: twoFactorStatusSchema } } },
    async (request, reply) => {
      const status = await getTwoFactorStatus(app.prisma, request.customer!.sub);
      return reply.send(status);
    },
  );

  server.post(
    "/portal/2fa/setup",
    { preHandler: requireCustomerAuth, schema: { response: { 200: twoFactorSetupResultSchema, 409: errorResponseSchema } } },
    async (request, reply) => {
      const result = await startTwoFactorSetup(app.prisma, app.redis, request.customer!.sub);
      return reply.send(result);
    },
  );

  server.post(
    "/portal/2fa/enable",
    {
      preHandler: requireCustomerAuth,
      schema: { body: enableTwoFactorSchema, response: { 200: enableTwoFactorResultSchema, 400: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const result = await confirmTwoFactorSetup(app.prisma, app.redis, request.customer!.sub, request.body.code);
      return reply.send(result);
    },
  );

  server.post(
    "/portal/2fa/disable",
    {
      preHandler: requireCustomerAuth,
      schema: { body: disableTwoFactorSchema, response: { 200: twoFactorStatusSchema, 401: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const status = await disableTwoFactor(app.prisma, request.customer!.sub, request.body.password);
      return reply.send(status);
    },
  );
}
