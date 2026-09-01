import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { DEFAULT_STORAGE_SETTINGS, storageSettingsSchema, type StorageSettings } from "@white-label/shared-types";
import { requirePermission, requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { decryptCredential, encryptCredential } from "../../lib/credentialEncryption.js";
import { applyStorageSettings, STORAGE_SETTINGS_KEY } from "../../lib/storage/storageRuntimeConfig.js";

/** Masks every secret field with a `<field>Configured: boolean` instead of returning it — same
 * pattern as platformIntegrations.routes.ts's safe(). The UI never receives a real secret back. */
function safe(value: StorageSettings) {
  return {
    provider: value.provider,
    s3: { ...value.s3, accessKeyId: undefined, accessKeyIdConfigured: Boolean(value.s3.accessKeyId), secretAccessKey: undefined, secretAccessKeyConfigured: Boolean(value.s3.secretAccessKey) },
    r2: { ...value.r2, accessKeyId: undefined, accessKeyIdConfigured: Boolean(value.r2.accessKeyId), secretAccessKey: undefined, secretAccessKeyConfigured: Boolean(value.r2.secretAccessKey) },
    spaces: {
      ...value.spaces,
      accessKeyId: undefined,
      accessKeyIdConfigured: Boolean(value.spaces.accessKeyId),
      secretAccessKey: undefined,
      secretAccessKeyConfigured: Boolean(value.spaces.secretAccessKey),
    },
    b2: { ...value.b2, accessKeyId: undefined, accessKeyIdConfigured: Boolean(value.b2.accessKeyId), secretAccessKey: undefined, secretAccessKeyConfigured: Boolean(value.b2.secretAccessKey) },
    bunny: { ...value.bunny, apiKey: undefined, apiKeyConfigured: Boolean(value.bunny.apiKey) },
    gcs: { ...value.gcs, privateKey: undefined, privateKeyConfigured: Boolean(value.gcs.privateKey) },
  };
}

export async function storageSettingsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const db = app.prisma as typeof app.prisma & { secureSetting: any; adminAuditLog: any };

  server.get("/admin/settings/storage", { preHandler: requireStaffAuth }, async (_request, reply) => {
    const record = await db.secureSetting.findUnique({ where: { key: STORAGE_SETTINGS_KEY } });
    if (!record) return reply.send(safe(DEFAULT_STORAGE_SETTINGS));
    return reply.send(safe(storageSettingsSchema.parse(JSON.parse(decryptCredential(record.encryptedValue)))));
  });

  server.put(
    "/admin/settings/storage",
    { preHandler: [requireStaffAuth, requirePermission("storage.manage")], schema: { body: storageSettingsSchema } },
    async (request, reply) => {
      const prior = await db.secureSetting.findUnique({ where: { key: STORAGE_SETTINGS_KEY } });
      const old: StorageSettings = prior ? storageSettingsSchema.parse(JSON.parse(decryptCredential(prior.encryptedValue))) : DEFAULT_STORAGE_SETTINGS;
      // Omitted secret fields preserve their prior value — the UI never receives them back to resubmit.
      const next: StorageSettings = {
        provider: request.body.provider,
        s3: { ...request.body.s3, accessKeyId: request.body.s3.accessKeyId || old.s3.accessKeyId, secretAccessKey: request.body.s3.secretAccessKey || old.s3.secretAccessKey },
        r2: { ...request.body.r2, accessKeyId: request.body.r2.accessKeyId || old.r2.accessKeyId, secretAccessKey: request.body.r2.secretAccessKey || old.r2.secretAccessKey },
        spaces: {
          ...request.body.spaces,
          accessKeyId: request.body.spaces.accessKeyId || old.spaces.accessKeyId,
          secretAccessKey: request.body.spaces.secretAccessKey || old.spaces.secretAccessKey,
        },
        b2: { ...request.body.b2, accessKeyId: request.body.b2.accessKeyId || old.b2.accessKeyId, secretAccessKey: request.body.b2.secretAccessKey || old.b2.secretAccessKey },
        bunny: { ...request.body.bunny, apiKey: request.body.bunny.apiKey || old.bunny.apiKey },
        gcs: { ...request.body.gcs, privateKey: request.body.gcs.privateKey || old.gcs.privateKey },
      };
      await app.prisma.$transaction([
        db.secureSetting.upsert({
          where: { key: STORAGE_SETTINGS_KEY },
          create: { key: STORAGE_SETTINGS_KEY, encryptedValue: encryptCredential(JSON.stringify(next)), updatedById: request.staffUser!.sub },
          update: { encryptedValue: encryptCredential(JSON.stringify(next)), updatedById: request.staffUser!.sub },
        }),
        db.adminAuditLog.create({ data: { actorId: request.staffUser!.sub, action: "storage_settings.updated", target: STORAGE_SETTINGS_KEY } }),
      ]);
      applyStorageSettings(next);
      return reply.send(safe(next));
    },
  );
}
