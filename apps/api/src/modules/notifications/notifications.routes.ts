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
import { sendMail, smtpConfig } from "../../lib/mailer.js";
import { AppError } from "../../lib/errors.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  getNotificationSettings,
  updateNotificationSettings,
  listEmailTemplates,
  updateEmailTemplate,
  resetEmailTemplate,
  resetAllEmailTemplates,
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

  server.delete(
    "/admin/settings/email-templates/:type",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: typeParam, response: { 200: emailTemplateSchema } },
    },
    async (request, reply) => {
      const template = await resetEmailTemplate(app.prisma, request.params.type);
      return reply.send(template);
    },
  );

  server.post(
    "/admin/settings/email-templates/reset-all",
    { preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")], schema: { response: { 200: z.array(emailTemplateSchema) } } },
    async (_request, reply) => {
      const templates = await resetAllEmailTemplates(app.prisma);
      return reply.send(templates);
    },
  );

  server.post(
    "/admin/settings/email-templates/:type/test",
    {
      preHandler: requireStaffAuth,
      schema: {
        params: typeParam,
        body: z.object({ to: z.string().email().optional() }).optional(),
        response: { 204: z.void(), 409: errorResponseSchema, 502: errorResponseSchema },
      },
    },
    async (request, reply) => {
      let to = request.body?.to;
      if (!to) {
        const staffUser = await app.prisma.staffUser.findUniqueOrThrow({ where: { id: request.staffUser!.sub } });
        to = staffUser.email;
      }
      const { subject, html } = await renderSampleEmail(app.prisma, request.params.type);

      let sent: boolean;
      try {
        sent = await sendMail({ to, subject: `[Test] ${subject}`, html });
      } catch (err) {
        // sendMail throws the real nodemailer/transport error (bad host, auth failure, timeout,
        // TLS mismatch, missing sendmail binary, etc.) — surfaced here instead of falling through
        // to app.ts's generic catch-all, which would otherwise hide it behind an opaque "Internal
        // server error" with no way for an admin to tell what's actually wrong with their email settings.
        const detail = err instanceof Error ? err.message : String(err);
        throw new AppError(`Couldn't send via ${smtpConfig.mode}: ${detail}`, 502, "EMAIL_SEND_FAILED");
      }
      if (!sent) {
        throw new AppError("SMTP isn't configured yet — set a host under Settings → Integrations first.", 409, "EMAIL_NOT_CONFIGURED");
      }

      return reply.code(204).send();
    },
  );
}
