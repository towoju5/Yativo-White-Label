import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  twoFactorStatusSchema,
  twoFactorSetupResultSchema,
  enableTwoFactorSchema,
  enableTwoFactorResultSchema,
  disableTwoFactorSchema,
} from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { getStaffTwoFactorStatus, startStaffTwoFactorSetup, confirmStaffTwoFactorSetup, disableStaffTwoFactor } from "./staffTwoFactor.service.js";

export async function staffTwoFactorRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/auth/2fa/status",
    { preHandler: requireStaffAuth, schema: { response: { 200: twoFactorStatusSchema } } },
    async (request, reply) => {
      const status = await getStaffTwoFactorStatus(app.prisma, request.staffUser!.sub);
      return reply.send(status);
    },
  );

  server.post(
    "/auth/2fa/setup",
    { preHandler: requireStaffAuth, schema: { response: { 200: twoFactorSetupResultSchema, 409: errorResponseSchema } } },
    async (request, reply) => {
      const result = await startStaffTwoFactorSetup(app.prisma, app.redis, request.staffUser!.sub);
      return reply.send(result);
    },
  );

  server.post(
    "/auth/2fa/enable",
    {
      preHandler: requireStaffAuth,
      schema: { body: enableTwoFactorSchema, response: { 200: enableTwoFactorResultSchema, 400: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const result = await confirmStaffTwoFactorSetup(app.prisma, app.redis, request.staffUser!.sub, request.body.code);
      return reply.send(result);
    },
  );

  server.post(
    "/auth/2fa/disable",
    {
      preHandler: requireStaffAuth,
      schema: { body: disableTwoFactorSchema, response: { 200: twoFactorStatusSchema, 401: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const status = await disableStaffTwoFactor(app.prisma, request.staffUser!.sub, request.body.password);
      return reply.send(status);
    },
  );
}
