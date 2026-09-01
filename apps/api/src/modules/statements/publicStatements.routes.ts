import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { formatMinorAmount } from "@white-label/shared-types";
import { verifyStatementToken } from "../../lib/statementVerification.js";
import { getWalletStatementForRange } from "../wallets/wallets.service.js";
import { getBranding } from "../branding/branding.service.js";

/** First name + last initial for an individual, the business name as-is for a business, or a
 * truncated local-part fallback — enough for a verifier to recognize "yes, that's them" without
 * this public, unauthenticated endpoint ever revealing a full legal name. */
function maskCustomerName(fullName: string | null, businessName: string | null, email: string): string {
  if (businessName) return businessName;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (!first) return email;
    if (parts.length <= 1 || !last) return first;
    return `${first} ${last[0]}.`;
  }
  return `${(email.split("@")[0] ?? email).slice(0, 2)}***`;
}

function maskAccountLabel(currencyCode: string, walletId: string): string {
  return `${currencyCode} account ending in ${walletId.slice(-4)}`;
}

const notFoundResponse = { valid: z.literal(false), message: z.string() };

export async function publicStatementsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/public/statements/verify/:token",
    {
      schema: {
        params: z.object({ token: z.string() }),
        response: {
          200: z.object({
            valid: z.literal(true),
            productName: z.string(),
            customerName: z.string(),
            accountLabel: z.string(),
            currencyCode: z.string(),
            dateFrom: z.string(),
            dateTo: z.string(),
            closingBalance: z.string(),
          }),
          404: z.object(notFoundResponse),
        },
      },
    },
    async (request, reply) => {
      const payload = verifyStatementToken(request.params.token);
      if (!payload) return reply.code(404).send({ valid: false, message: "This verification link is invalid or has been tampered with." });

      const wallet = await app.prisma.wallet.findUnique({ where: { id: payload.walletId }, include: { account: true, currency: true, customer: true } });
      if (!wallet) return reply.code(404).send({ valid: false, message: "This statement could not be found." });

      const dateFrom = new Date(payload.dateFrom);
      const dateTo = new Date(payload.dateTo);
      const [{ closingBalanceMinor }, branding] = await Promise.all([
        getWalletStatementForRange(app.prisma, wallet.accountId, wallet.account.type, dateFrom, dateTo),
        getBranding(app.prisma),
      ]);

      return reply.send({
        valid: true,
        productName: branding.productName,
        customerName: maskCustomerName(wallet.customer.fullName, wallet.customer.businessName, wallet.customer.email),
        accountLabel: maskAccountLabel(wallet.currencyCode, wallet.id),
        currencyCode: wallet.currencyCode,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        closingBalance: formatMinorAmount(closingBalanceMinor, wallet.currency.decimals),
      });
    },
  );
}
