import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { passkeySchema, finishPasskeyRegistrationSchema, renamePasskeySchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  listCustomerPasskeys,
  getCustomerPasskeyRegistrationOptions,
  verifyCustomerPasskeyRegistration,
  renameCustomerPasskey,
  deleteCustomerPasskey,
} from "./customerPasskeys.service.js";

export async function customerPasskeysRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.get(
    "/portal/passkeys",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(passkeySchema) } } },
    async (request, reply) => {
      const passkeys = await listCustomerPasskeys(app.prisma, request.customer!.sub);
      return reply.send(passkeys);
    },
  );

  server.post("/portal/passkeys/register/options", { preHandler: requireCustomerAuth }, async (request, reply) => {
    const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
    const options = await getCustomerPasskeyRegistrationOptions(app.prisma, app.redis, customer.id, customer.email);
    return reply.send(options);
  });

  server.post(
    "/portal/passkeys/register/verify",
    {
      preHandler: requireCustomerAuth,
      schema: { body: finishPasskeyRegistrationSchema, response: { 200: passkeySchema, 400: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const passkey = await verifyCustomerPasskeyRegistration(
        app.prisma,
        app.redis,
        request.customer!.sub,
        request.body.response as unknown as RegistrationResponseJSON,
        request.body.name,
      );
      return reply.send(passkey);
    },
  );

  server.patch(
    "/portal/passkeys/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: idParam, body: renamePasskeySchema, response: { 200: passkeySchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const passkey = await renameCustomerPasskey(app.prisma, request.customer!.sub, request.params.id, request.body.name);
      return reply.send(passkey);
    },
  );

  server.delete(
    "/portal/passkeys/:id",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 204: z.void(), 404: errorResponseSchema } } },
    async (request, reply) => {
      await deleteCustomerPasskey(app.prisma, request.customer!.sub, request.params.id);
      return reply.code(204).send();
    },
  );
}
