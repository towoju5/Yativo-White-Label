import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notificationSchema, pushSubscriptionRequestSchema, paginationQuerySchema, paginatedResponseSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { notificationChannelConfig } from "../../lib/notificationChannelConfig.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { NotFoundError } from "../../lib/errors.js";

function toDto(n: { id: string; type: string; title: string; body: string; readAt: Date | null; createdAt: Date }) {
  return { id: n.id, type: n.type as never, title: n.title, body: n.body, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() };
}

/** Customer-facing notification center + web push subscription management. Admin channel config lives in notificationChannels.routes.ts. */
export async function portalNotificationsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/notifications",
    { preHandler: requireCustomerAuth, schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(notificationSchema) } } },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      const { page, pageSize } = request.query;
      const [items, total] = await Promise.all([
        app.prisma.notification.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
        app.prisma.notification.count({ where: { customerId } }),
      ]);
      return reply.send({ items: items.map(toDto), page, pageSize, total });
    },
  );

  server.get(
    "/portal/notifications/unread-count",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.object({ count: z.number() }) } } },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      const count = await app.prisma.notification.count({ where: { customerId, readAt: null } });
      return reply.send({ count });
    },
  );

  server.post(
    "/portal/notifications/read-all",
    { preHandler: requireCustomerAuth, schema: { response: { 204: z.void() } } },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      await app.prisma.notification.updateMany({ where: { customerId, readAt: null }, data: { readAt: new Date() } });
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/notifications/:id/read",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      const notification = await app.prisma.notification.findFirst({ where: { id: request.params.id, customerId } });
      if (!notification) throw new NotFoundError("Notification");
      await app.prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
      return reply.code(204).send();
    },
  );

  server.get(
    "/portal/notifications/push/vapid-public-key",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.object({ publicKey: z.string().nullable() }) } } },
    async (_request, reply) => {
      return reply.send({ publicKey: notificationChannelConfig.webPush.vapidPublicKey || null });
    },
  );

  server.post(
    "/portal/notifications/push-subscriptions",
    { preHandler: requireCustomerAuth, schema: { body: pushSubscriptionRequestSchema, response: { 204: z.void() } } },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      await app.prisma.pushSubscription.upsert({
        where: { endpoint: request.body.endpoint },
        create: { customerId, endpoint: request.body.endpoint, p256dh: request.body.keys.p256dh, auth: request.body.keys.auth },
        update: { customerId, p256dh: request.body.keys.p256dh, auth: request.body.keys.auth },
      });
      return reply.code(204).send();
    },
  );

  server.post(
    "/portal/notifications/push-subscriptions/unsubscribe",
    { preHandler: requireCustomerAuth, schema: { body: z.object({ endpoint: z.string() }), response: { 204: z.void() } } },
    async (request, reply) => {
      await app.prisma.pushSubscription.deleteMany({ where: { endpoint: request.body.endpoint } });
      return reply.code(204).send();
    },
  );
}
