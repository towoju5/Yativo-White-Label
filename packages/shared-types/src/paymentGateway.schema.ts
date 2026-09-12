import { z } from "zod";

export const PAYMENT_GATEWAY_KINDS = ["PAYIN", "PAYOUT"] as const;
export const paymentGatewayKindSchema = z.enum(PAYMENT_GATEWAY_KINDS);
export type PaymentGatewayKind = z.infer<typeof paymentGatewayKindSchema>;

/** One payment rail as seen by admin tooling — `active` is Yativo's own flag, `isEnabledForCustomers` is this platform's own override on top of it (see PaymentGatewayOverride). */
export const adminPaymentGatewaySchema = z.object({
  gatewayId: z.string(),
  methodName: z.string(),
  country: z.string().optional(),
  currency: z.string().optional(),
  active: z.boolean(),
  isEnabledForCustomers: z.boolean(),
});
export type AdminPaymentGateway = z.infer<typeof adminPaymentGatewaySchema>;

export const updateGatewayEnabledSchema = z.object({
  isEnabledForCustomers: z.boolean(),
});
export type UpdateGatewayEnabledInput = z.infer<typeof updateGatewayEnabledSchema>;
