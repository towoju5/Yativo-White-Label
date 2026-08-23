import { createYativoClient } from "@white-label/yativo-sdk";
import { env } from "../config/env.js";

/** Single shared Yativo SDK client for the whole API process, configured from env. */
export const yativoClient = createYativoClient({
  mode: env.YATIVO_MODE,
  fiatBaseUrl: env.YATIVO_FIAT_BASE_URL,
  cryptoBaseUrl: env.YATIVO_CRYPTO_BASE_URL,
  kycBaseUrl: env.YATIVO_KYC_BASE_URL,
  apiKey: env.YATIVO_API_KEY,
  apiSecret: env.YATIVO_API_SECRET,
});
