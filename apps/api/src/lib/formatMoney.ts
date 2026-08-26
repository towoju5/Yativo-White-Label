import type { PrismaClient } from "@prisma/client";

/** Renders a minor-unit amount (cents, etc.) as a decimal string for display in emails — the API's JSON responses leave this to the frontend, but server-rendered email HTML needs it formatted here. */
export async function formatMinorAmount(prisma: PrismaClient, currencyCode: string, amountMinor: bigint | number): Promise<string> {
  const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
  const decimals = currency?.decimals ?? 2;
  const amount = Number(amountMinor) / 10 ** decimals;
  return amount.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
