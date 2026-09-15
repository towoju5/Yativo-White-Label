import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { endorsementDisplaySettingsResponseSchema, endorsementDisplaySettingSchema, upsertEndorsementDisplaySettingSchema } from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { listEndorsementDisplaySettings, upsertEndorsementDisplaySetting, deleteEndorsementDisplaySetting } from "./endorsementSettings.service.js";

export async function endorsementSettingsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/endorsement-settings",
    { preHandler: requireStaffAuth, schema: { response: { 200: endorsementDisplaySettingsResponseSchema } } },
    async (_request, reply) => reply.send(await listEndorsementDisplaySettings(app.prisma)),
  );

  server.put(
    "/admin/endorsement-settings/:service",
    {
      preHandler: [requireStaffAuth, requirePermission("endorsements.manage")],
      schema: { params: z.object({ service: z.string().min(1) }), body: upsertEndorsementDisplaySettingSchema, response: { 200: endorsementDisplaySettingSchema } },
    },
    async (request, reply) => {
      const setting = await upsertEndorsementDisplaySetting(app.prisma, request.params.service, request.body);
      return reply.send(setting);
    },
  );

  server.delete(
    "/admin/endorsement-settings/:service",
    {
      preHandler: [requireStaffAuth, requirePermission("endorsements.manage")],
      schema: { params: z.object({ service: z.string().min(1) }), response: { 204: z.void() } },
    },
    async (request, reply) => {
      await deleteEndorsementDisplaySetting(app.prisma, request.params.service);
      return reply.code(204).send();
    },
  );
}
