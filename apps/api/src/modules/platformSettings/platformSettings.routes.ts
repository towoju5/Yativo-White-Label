import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  walletCurrencySettingsSchema,
  updatePlatformSettingsSchema,
  updateCurrencyEnabledSchema,
  updateKycRequirementsSchema,
  updateEmailVerificationSchema,
  updateCustomerLoginMethodSchema,
  updateNewLocationLoginCheckSchema,
  portalAuthConfigSchema,
  adminCurrencySchema,
} from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { rescheduleCurrencySync } from "../../jobs/currencySyncScheduler.js";
import {
  getWalletCurrencySettings,
  syncCurrenciesFromYativo,
  updatePlatformSettings,
  updateKycRequirements,
  updateEmailVerificationSetting,
  updateCustomerLoginMethod,
  updateNewLocationLoginCheck,
  getPortalAuthConfig,
  setCurrencyEnabled,
} from "./platformSettings.service.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";
import { requireStepUp } from "../../middleware/requireStepUp.js";

export async function platformSettingsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/settings/wallet-currencies",
    { preHandler: requireStaffAuth, schema: { response: { 200: walletCurrencySettingsSchema } } },
    async (_request, reply) => {
      const result = await getWalletCurrencySettings(app.prisma);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/settings/wallet-currencies/sync",
    { preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")], schema: { response: { 200: walletCurrencySettingsSchema } } },
    async (_request, reply) => {
      const result = await syncCurrenciesFromYativo(app.prisma);
      return reply.send(result);
    },
  );

  server.patch(
    "/admin/settings/wallet-currencies",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { body: updatePlatformSettingsSchema, response: { 200: walletCurrencySettingsSchema.shape.settings, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const settings = await updatePlatformSettings(app.prisma, request.body);
      if (request.body.currencySyncFrequency) {
        await rescheduleCurrencySync(request.body.currencySyncFrequency);
      }
      return reply.send(settings);
    },
  );

  server.patch(
    "/admin/settings/kyc-requirements",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { body: updateKycRequirementsSchema, response: { 200: walletCurrencySettingsSchema.shape.settings } },
    },
    async (request, reply) => {
      const settings = await updateKycRequirements(app.prisma, request.body);
      return reply.send(settings);
    },
  );

  server.patch(
    "/admin/settings/email-verification",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { body: updateEmailVerificationSchema, response: { 200: walletCurrencySettingsSchema.shape.settings } },
    },
    async (request, reply) => {
      const settings = await updateEmailVerificationSetting(app.prisma, request.body);
      return reply.send(settings);
    },
  );

  server.patch(
    "/admin/settings/new-location-login-check",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN"), requireStepUp("Change the new-location login check")],
      schema: { body: updateNewLocationLoginCheckSchema, response: { 200: walletCurrencySettingsSchema.shape.settings } },
    },
    async (request, reply) => {
      const settings = await updateNewLocationLoginCheck(app.prisma, request.body);
      await logAdminAction(app.prisma, request.staffUser!.sub, "platform_settings.new_location_login_check", "platform_settings", { enabled: request.body.newLocationLoginCheck });
      return reply.send(settings);
    },
  );

  server.patch(
    "/admin/settings/customer-login-method",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN"), requireStepUp("Change the customer login method")],
      schema: { body: updateCustomerLoginMethodSchema, response: { 200: walletCurrencySettingsSchema.shape.settings } },
    },
    async (request, reply) => {
      const settings = await updateCustomerLoginMethod(app.prisma, request.body);
      return reply.send(settings);
    },
  );

  server.get(
    "/portal/auth/config",
    { schema: { response: { 200: portalAuthConfigSchema } } },
    async (_request, reply) => reply.send(await getPortalAuthConfig(app.prisma)),
  );

  server.patch(
    "/admin/settings/wallet-currencies/:code",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: {
        params: z.object({ code: z.string().length(3) }),
        body: updateCurrencyEnabledSchema,
        response: { 200: adminCurrencySchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const currency = await setCurrencyEnabled(app.prisma, request.params.code, request.body.isEnabledForCustomers);
      return reply.send(currency);
    },
  );
}
