import type { PrismaClient } from "@prisma/client";
import { DEFAULT_STORAGE_SETTINGS, type StorageSettings } from "@white-label/shared-types";
import { decryptCredential } from "../credentialEncryption.js";
import logger from "../logger.js";

export const STORAGE_SETTINGS_KEY = "storage-settings";

/** Mutable holder read by storageFactory.ts on every upload — same pattern as
 * integrationRuntimeConfig.ts's yativoClient.config, so a settings change takes effect on the
 * very next upload with no restart. */
export const storageRuntimeState: { settings: StorageSettings } = { settings: DEFAULT_STORAGE_SETTINGS };

export function applyStorageSettings(settings: StorageSettings): void {
  storageRuntimeState.settings = settings;
}

/** Called once at boot, after prismaPlugin is registered. Leaves the default (local) provider in place when no row has been saved yet. */
export async function loadStorageSettingsFromDb(prisma: PrismaClient): Promise<void> {
  const db = prisma as PrismaClient & { secureSetting: { findUnique: (args: { where: { key: string } }) => Promise<{ encryptedValue: string } | null> } };
  const record = await db.secureSetting.findUnique({ where: { key: STORAGE_SETTINGS_KEY } });
  if (!record) return;
  try {
    applyStorageSettings(JSON.parse(decryptCredential(record.encryptedValue)) as StorageSettings);
  } catch (err) {
    logger.error({ err }, "Failed to load storage settings from DB at boot — keeping the default local-disk provider");
  }
}
