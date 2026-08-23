import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { verifyYativoSignature, yativoWebhookEnvelopeSchema } from "@white-label/yativo-sdk";
import { env } from "../config/env.js";
import logger from "../lib/logger.js";
import { enqueueWebhookEvent } from "../jobs/queue.js";

const YATIVO_SIGNATURE_HEADER = "x-yativo-signature";

export async function webhookRoutes(app: FastifyInstance) {
  // `app.register(webhookRoutes)` creates its own encapsulated Fastify context, so this
  // content-type parser override only applies to routes registered on `app` inside this
  // function — every other route in the app keeps the default JSON body parser. We need
  // the raw, unparsed bytes here to verify the HMAC signature against exactly what Yativo signed.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/webhooks/yativo",
    { schema: { response: { 200: z.object({ status: z.string() }), 400: z.object({ message: z.string() }) } } },
    async (request, reply) => {
      const rawBody = request.body as Buffer;
      const signatureHeader = request.headers[YATIVO_SIGNATURE_HEADER];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

      if (!signature || !verifyYativoSignature(rawBody, signature, env.YATIVO_WEBHOOK_SECRET)) {
        logger.warn("Rejected Yativo webhook with invalid or missing signature");
        return reply.code(400).send({ message: "Invalid signature" });
      }

      let envelope: z.infer<typeof yativoWebhookEnvelopeSchema>;
      try {
        envelope = yativoWebhookEnvelopeSchema.parse(JSON.parse(rawBody.toString("utf8")));
      } catch {
        return reply.code(400).send({ message: "Malformed webhook payload" });
      }

      let event;
      try {
        event = await app.prisma.webhookEvent.create({
          data: {
            externalEventId: envelope.eventId,
            eventType: envelope.eventType,
            payload: envelope.data as Prisma.InputJsonValue,
            signatureValid: true,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          // Duplicate delivery of an eventId we've already recorded — idempotent no-op,
          // do not re-enqueue or reprocess.
          return reply.code(200).send({ status: "duplicate" });
        }
        throw err;
      }

      await enqueueWebhookEvent(event.id);
      return reply.code(200).send({ status: "accepted" });
    },
  );
}
