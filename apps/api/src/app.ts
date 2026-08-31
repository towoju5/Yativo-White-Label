import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { YativoApiError, parseYativoErrorMessage } from "@white-label/yativo-sdk";
import { env } from "./config/env.js";
import logger from "./lib/logger.js";
import { AppError } from "./lib/errors.js";
import { buildCorsOriginCheck } from "./lib/cors.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { redisPlugin } from "./plugins/redis.js";
import { loadIntegrationSettingsFromDb } from "./lib/integrationRuntimeConfig.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { portalAuthRoutes } from "./modules/portalAuth/portalAuth.routes.js";
import { brandingRoutes } from "./modules/branding/branding.routes.js";
import { customersRoutes } from "./modules/customers/customers.routes.js";
import { portalWalletsRoutes } from "./modules/wallets/portalWallets.routes.js";
import { transactionsRoutes } from "./modules/transactions/transactions.routes.js";
import { beneficiariesRoutes } from "./modules/beneficiaries/beneficiaries.routes.js";
import { quotesRoutes } from "./modules/quotes/quotes.routes.js";
import { portalPayoutsRoutes } from "./modules/payouts/payouts.routes.js";
import { adminPayoutsRoutes } from "./modules/payouts/adminPayouts.routes.js";
import { depositsRoutes } from "./modules/deposits/deposits.routes.js";
import { virtualAccountsRoutes } from "./modules/virtualAccounts/virtualAccounts.routes.js";
import { kycRoutes } from "./modules/kyc/kyc.routes.js";
import { portalCardsRoutes } from "./modules/cards/portalCards.routes.js";
import { adminCardsRoutes } from "./modules/cards/adminCards.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { apiKeysRoutes } from "./modules/apiKeys/apiKeys.routes.js";
import { reconciliationRoutes } from "./modules/reconciliation/reconciliation.routes.js";
import { adminCryptoWalletsRoutes } from "./modules/cryptoWallets/adminCryptoWallets.routes.js";
import { portalCryptoWalletsRoutes } from "./modules/cryptoWallets/portalCryptoWallets.routes.js";
import { locationsRoutes } from "./modules/locations/locations.routes.js";
import { platformSettingsRoutes } from "./modules/platformSettings/platformSettings.routes.js";
import { twoFactorRoutes } from "./modules/twoFactor/twoFactor.routes.js";
import { pagesRoutes } from "./modules/pages/pages.routes.js";
import { webhookRoutes } from "./webhooks/yativo.routes.js";
import { adminWebhooksRoutes } from "./webhooks/adminWebhooks.routes.js";
import { integrationsRoutes } from "./modules/integrations/integrations.routes.js";
import { platformIntegrationsRoutes } from "./modules/integrations/platformIntegrations.routes.js";
import { staffPasskeysRoutes } from "./modules/passkeys/staffPasskeys.routes.js";
import { customerPasskeysRoutes } from "./modules/passkeys/customerPasskeys.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";

export async function buildApp() {
  // Fastify's default bodyLimit is 1MB — comfortably exceeded by a KYC submission carrying a
  // few base64-encoded images (each ~1.33x its raw size; Yativo's own per-file cap is 4MB, so
  // several such fields need real headroom). Raised here rather than left at the default so a
  // large-but-valid submission fails with a clear multipart-level error instead of the browser
  // seeing an opaque connection reset.
  const app = Fastify({ loggerInstance: logger, bodyLimit: 30 * 1024 * 1024 }).withTypeProvider();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: buildCorsOriginCheck(env.WEB_APP_URL, env.NODE_ENV), credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  // Slightly above the 4MB-per-file KYC rule (see FILE_MAX_BYTES) so an over-limit file gets our
  // own clear validation error instead of a raw stream-abort; `files` covers the worst case
  // (business KYB with several owners, each with 2 ID-document images, plus address/business docs).
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 50,
      // Yativo's API has a confirmed server-side bug that silently drops nested (non-top-level)
      // binary file fields once the rest of a submission validates — see kyc.ts's UploadedFile
      // union type. Those fields fall back to base64-in-a-text-field instead, so fieldSize needs
      // the same headroom as fileSize/bodyLimit, not the 1MB default.
      fieldSize: 8 * 1024 * 1024,
    },
  });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await loadIntegrationSettingsFromDb(app.prisma);

  app.setErrorHandler((error: FastifyError | AppError | YativoApiError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message, code: error.code });
    }
    if (error instanceof YativoApiError) {
      // Always log the full upstream body server-side — that's the actual reason, and it never
      // reaches the browser console otherwise.
      app.log.error({ method: error.method, path: error.path, upstreamStatus: error.upstreamStatus, upstreamBody: error.upstreamBody }, error.message);
      if (error.upstreamStatus === 401 || error.upstreamStatus === 403) {
        // Not something the customer did wrong — this API key/route combination isn't authorized
        // on Yativo's side yet (see todo.md §0's auth note).
        return reply
          .code(503)
          .send({ message: "This feature isn't available yet — please contact support.", code: "PROVIDER_AUTH_ERROR" });
      }
      // Every other 4xx is (usually) something the customer can fix — bad payment_data, insufficient
      // balance, a stale/mismatched quote, a gateway that needs a customer_id, etc. Surface Yativo's
      // own `data.error`/`message` rather than a generic message; only fall back when the body isn't
      // parseable (a true 5xx or an unexpected shape).
      if (error.upstreamStatus >= 400 && error.upstreamStatus < 500) {
        const upstreamMessage = parseYativoErrorMessage(error.upstreamBody);
        return reply.code(error.upstreamStatus).send({
          message: upstreamMessage ?? "The payment provider rejected this request. Please check your details and try again.",
          code: "PROVIDER_ERROR",
        });
      }
      return reply.code(502).send({ message: "The payment provider is temporarily unavailable. Please try again shortly.", code: "PROVIDER_ERROR" });
    }
    if (error.validation) {
      return reply.code(400).send({ message: error.message, code: "VALIDATION_ERROR" });
    }
    if (typeof error.statusCode === "number" && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ message: error.message, code: "REQUEST_ERROR" });
    }
    app.log.error(error);
    return reply.code(500).send({ message: "Internal server error", code: "INTERNAL_ERROR" });
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes);
  await app.register(portalAuthRoutes);
  await app.register(brandingRoutes);
  await app.register(customersRoutes);
  await app.register(portalWalletsRoutes);
  await app.register(transactionsRoutes);
  await app.register(beneficiariesRoutes);
  await app.register(quotesRoutes);
  await app.register(portalPayoutsRoutes);
  await app.register(adminPayoutsRoutes);
  await app.register(depositsRoutes);
  await app.register(virtualAccountsRoutes);
  await app.register(kycRoutes);
  await app.register(portalCardsRoutes);
  await app.register(adminCardsRoutes);
  await app.register(dashboardRoutes);
  await app.register(apiKeysRoutes);
  await app.register(reconciliationRoutes);
  await app.register(adminCryptoWalletsRoutes);
  await app.register(portalCryptoWalletsRoutes);
  await app.register(locationsRoutes);
  await app.register(platformSettingsRoutes);
  await app.register(twoFactorRoutes);
  await app.register(pagesRoutes);
  await app.register(webhookRoutes);
  await app.register(adminWebhooksRoutes);
  await app.register(integrationsRoutes);
  await app.register(platformIntegrationsRoutes);
  await app.register(staffPasskeysRoutes);
  await app.register(customerPasskeysRoutes);
  await app.register(notificationsRoutes);

  return app;
}
