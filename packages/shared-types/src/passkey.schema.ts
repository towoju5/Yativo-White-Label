import { z } from "zod";

export const passkeySchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceType: z.string(),
  backedUp: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type PasskeyDto = z.infer<typeof passkeySchema>;

// WebAuthn registration/authentication options and responses are opaque, browser-generated JSON
// blobs (PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON, etc.) — @simplewebauthn
// on both ends is the actual source of truth for their shape, so these are deliberately loose
// rather than re-modeling the whole WebAuthn spec in Zod.
const webauthnJson = z.record(z.string(), z.unknown());

export const finishPasskeyRegistrationSchema = z.object({
  response: webauthnJson,
  name: z.string().min(1).max(60),
});
export type FinishPasskeyRegistrationInput = z.infer<typeof finishPasskeyRegistrationSchema>;

export const renamePasskeySchema = z.object({ name: z.string().min(1).max(60) });
export type RenamePasskeyInput = z.infer<typeof renamePasskeySchema>;

export const passkeyLoginOptionsResultSchema = z.object({
  flowId: z.string(),
  options: webauthnJson,
});
export type PasskeyLoginOptionsResult = z.infer<typeof passkeyLoginOptionsResultSchema>;

export const verifyPasskeyLoginSchema = z.object({
  flowId: z.string(),
  response: webauthnJson,
});
export type VerifyPasskeyLoginInput = z.infer<typeof verifyPasskeyLoginSchema>;
