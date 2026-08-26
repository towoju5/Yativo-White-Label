import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { passkeySchema, finishPasskeyRegistrationSchema, renamePasskeySchema } from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  listStaffPasskeys,
  getStaffPasskeyRegistrationOptions,
  verifyStaffPasskeyRegistration,
  renameStaffPasskey,
  deleteStaffPasskey,
} from "./staffPasskeys.service.js";

export async function staffPasskeysRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.get("/admin/passkeys", { preHandler: requireStaffAuth, schema: { response: { 200: z.array(passkeySchema) } } }, async (request, reply) => {
    const passkeys = await listStaffPasskeys(app.prisma, request.staffUser!.sub);
    return reply.send(passkeys);
  });

  server.post("/admin/passkeys/register/options", { preHandler: requireStaffAuth }, async (request, reply) => {
    const staffUser = await app.prisma.staffUser.findUniqueOrThrow({ where: { id: request.staffUser!.sub } });
    const options = await getStaffPasskeyRegistrationOptions(app.prisma, app.redis, staffUser.id, staffUser.email);
    return reply.send(options);
  });

  server.post(
    "/admin/passkeys/register/verify",
    {
      preHandler: requireStaffAuth,
      schema: { body: finishPasskeyRegistrationSchema, response: { 200: passkeySchema, 400: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const passkey = await verifyStaffPasskeyRegistration(
        app.prisma,
        app.redis,
        request.staffUser!.sub,
        request.body.response as unknown as RegistrationResponseJSON,
        request.body.name,
      );
      return reply.send(passkey);
    },
  );

  server.patch(
    "/admin/passkeys/:id",
    { preHandler: requireStaffAuth, schema: { params: idParam, body: renamePasskeySchema, response: { 200: passkeySchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const passkey = await renameStaffPasskey(app.prisma, request.staffUser!.sub, request.params.id, request.body.name);
      return reply.send(passkey);
    },
  );

  server.delete(
    "/admin/passkeys/:id",
    { preHandler: requireStaffAuth, schema: { params: idParam, response: { 204: z.void(), 404: errorResponseSchema } } },
    async (request, reply) => {
      await deleteStaffPasskey(app.prisma, request.staffUser!.sub, request.params.id);
      return reply.code(204).send();
    },
  );
}
