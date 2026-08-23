import type { Customer, PrismaClient, KycRequiredService } from "@prisma/client";
import { KycRequiredError } from "./errors.js";
import { getPlatformSettings } from "../modules/platformSettings/platformSettings.service.js";

/** Gate for actions that may need a verified identity — admin controls which services actually require it via PlatformSettings.kycRequiredServices (Settings → Verification requirements). */
export async function requireKycApprovedForService(
  prisma: PrismaClient,
  service: KycRequiredService,
  customer: Pick<Customer, "kycStatus">,
): Promise<void> {
  const settings = await getPlatformSettings(prisma);
  if (!settings.kycRequiredServices.includes(service)) return;
  if (customer.kycStatus !== "APPROVED") throw new KycRequiredError();
}
