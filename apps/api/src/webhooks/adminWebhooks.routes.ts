import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { webhookEventSchema, paginationQuerySchema, paginatedResponseSchema, WEBHOOK_PROCESSING_STATUSES } from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../lib/httpSchemas.js";
import { enqueueWebhookEvent } from "../jobs/queue.js";
import { NotFoundError } from "../lib/errors.js";

function webhookEventToDto(event: {
  id: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  payload: unknown;
  signatureValid: boolean;
  processingStatus: string;
  errorMessage: string | null;
  receivedAt: Date;
  processedAt: Date | null;
}) {
  return {
    id: event.id,
    provider: event.provider as "YATIVO",
    externalEventId: event.externalEventId,
    eventType: event.eventType,
    payload: (event.payload as Record<string, unknown>) ?? {},
    signatureValid: event.signatureValid,
    processingStatus: event.processingStatus as (typeof WEBHOOK_PROCESSING_STATUSES)[number],
    errorMessage: event.errorMessage,
    receivedAt: event.receivedAt.toISOString(),
    processedAt: event.processedAt?.toISOString() ?? null,
  };
}

const listQuerySchema = paginationQuerySchema.extend({
  processingStatus: z.enum(WEBHOOK_PROCESSING_STATUSES).optional(),
  eventType: z.string().optional(),
});

export async function adminWebhooksRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/webhooks",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: listQuerySchema, response: { 200: paginatedResponseSchema(webhookEventSchema) } },
    },
    async (request, reply) => {
      const { page, pageSize, processingStatus, eventType } = request.query;
      const where = {
        ...(processingStatus ? { processingStatus } : {}),
        ...(eventType ? { eventType } : {}),
      };
      const [total, events] = await Promise.all([
        app.prisma.webhookEvent.count({ where }),
        app.prisma.webhookEvent.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return reply.send({ items: events.map(webhookEventToDto), total, page, pageSize });
    },
  );

  server.post(
    "/admin/webhooks/:id/replay",
    {
      preHandler: [requireStaffAuth, requirePermission("webhooks.manage")],
      schema: { params: z.object({ id: z.string() }), response: { 200: webhookEventSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const event = await app.prisma.webhookEvent.findUnique({ where: { id: request.params.id } });
      if (!event) throw new NotFoundError("WebhookEvent");

      const reset = await app.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: "PENDING", errorMessage: null },
      });
      await enqueueWebhookEvent(event.id);
      return reply.send(webhookEventToDto(reset));
    },
  );
}
