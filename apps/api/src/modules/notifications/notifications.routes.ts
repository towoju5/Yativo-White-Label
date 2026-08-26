import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  notificationSettingsSchema,
  updateNotificationSettingsSchema,
  emailTemplateSchema,
  updateEmailTemplateSchema,
  emailNotificationTypeSchema,
} from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { sendMail } from "../../lib/mailer.js";
import {
  getNotificationSettings,
  updateNotificationSettings,
  listEmailTemplates,
  updateEmailTemplate,
  renderSampleEmail,
} from "./notifications.service.js";

export async function notificationsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const typeParam = z.object({ type: emailNotificationTypeSchema });

  server.get(
    "/admin/settings/notifications",
    { preHandler: requireStaffAuth, schema: { response: { 200: notificationSettingsSchema } } },
    async (_request, reply) => {
      const settings = await getNotificationSettings(app.prisma);
      return reply.send(settings);
    },
  );

  server.patch(
    "/admin/settings/notifications",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { body: updateNotificationSettingsSchema, response: { 200: notificationSettingsSchema } },
    },
    async (request, reply) => {
      const settings = await updateNotificationSettings(app.prisma, request.body);
      return reply.send(settings);
    },
  );

  server.get(
    "/admin/settings/email-templates",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(emailTemplateSchema) } } },
    async (_request, reply) => {
      const templates = await listEmailTemplates(app.prisma);
      return reply.send(templates);
    },
  );

  server.patch(
    "/admin/settings/email-templates/:type",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: typeParam, body: updateEmailTemplateSchema, response: { 200: emailTemplateSchema } },
    },
    async (request, reply) => {
      const template = await updateEmailTemplate(app.prisma, request.params.type, request.body);
      return reply.send(template);
    },
  );

  server.post(
    "/admin/settings/email-templates/:type/test",
    { preHandler: requireStaffAuth, schema: { params: typeParam, response: { 204: z.void() } } },
    async (request, reply) => {
      const staffUser = await app.prisma.staffUser.findUniqueOrThrow({ where: { id: request.staffUser!.sub } });
      const { subject, html } = await renderSampleEmail(app.prisma, request.params.type);
      await sendMail({ to: staffUser.email, subject: `[Test] ${subject}`, html });
      return reply.code(204).send();
    },
  );
}
