import { z } from "zod";

/** The fixed catalog of transactional emails a customer can receive — every key here has a real trigger site in the API (see notifications.service.ts's sendNotificationEmail call sites). */
export const EMAIL_NOTIFICATION_TYPES = [
  "WELCOME",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "DEPOSIT_CREATED",
  "DEPOSIT_RECEIVED",
  "PAYOUT_CREATED",
  "PAYOUT_COMPLETED",
  "PAYOUT_FAILED",
  "CARD_ISSUED",
  "CARD_FROZEN",
  "CARD_UNFROZEN",
  "CARD_TERMINATED",
  "CARD_TRANSACTION",
  "BUSINESS_SPEND_CARD_ISSUED",
  "BUSINESS_SPEND_CARD_ACTIVATED",
  "BUSINESS_SPEND_CARD_SUSPENDED",
  "BUSINESS_SPEND_CARD_TERMINATED",
  "SWAP_COMPLETED",
  "TWO_FACTOR_ENABLED",
  "TWO_FACTOR_DISABLED",
  "PASSKEY_ADDED",
  "PASSKEY_REMOVED",
  "BENEFICIARY_ADDED",
] as const;

export const emailNotificationTypeSchema = z.enum(EMAIL_NOTIFICATION_TYPES);
export type EmailNotificationType = z.infer<typeof emailNotificationTypeSchema>;

/** Drives both the admin toggle list and the template editor's "available variables" hints. `firstName` and `productName` are always available on top of whatever's listed here. */
export const EMAIL_NOTIFICATION_CATALOG: { type: EmailNotificationType; label: string; description: string; group: string; variables: string[] }[] = [
  { type: "WELCOME", label: "Welcome email", description: "Sent right after a customer creates an account.", group: "Account", variables: [] },
  { type: "KYC_APPROVED", label: "Verification approved", description: "Sent when an admin approves a customer's identity verification.", group: "Account", variables: [] },
  { type: "KYC_REJECTED", label: "Verification rejected", description: "Sent when an admin rejects a customer's identity verification.", group: "Account", variables: ["reason"] },
  { type: "DEPOSIT_CREATED", label: "Deposit submitted", description: "Sent right when a customer initiates a deposit, before it's confirmed.", group: "Money movement", variables: ["amount", "currency"] },
  { type: "DEPOSIT_RECEIVED", label: "Deposit received", description: "Sent when a deposit is confirmed into a customer's wallet.", group: "Money movement", variables: ["amount", "currency"] },
  { type: "PAYOUT_CREATED", label: "Payout submitted", description: "Sent when a customer submits a payout.", group: "Money movement", variables: ["amount", "currency"] },
  { type: "PAYOUT_COMPLETED", label: "Payout completed", description: "Sent when a payout settles successfully.", group: "Money movement", variables: ["amount", "currency"] },
  { type: "PAYOUT_FAILED", label: "Payout failed", description: "Sent when a payout fails and funds are returned.", group: "Money movement", variables: ["amount", "currency", "reason"] },
  {
    type: "SWAP_COMPLETED",
    label: "Currency swap completed",
    description: "Sent when a currency swap settles.",
    group: "Money movement",
    variables: ["sourceAmount", "sourceCurrency", "targetAmount", "targetCurrency"],
  },
  { type: "BENEFICIARY_ADDED", label: "Beneficiary added", description: "Sent when a customer adds a new payout beneficiary.", group: "Money movement", variables: ["beneficiaryName"] },
  { type: "CARD_ISSUED", label: "Card issued", description: "Sent when a new virtual card is issued.", group: "Cards", variables: ["last4"] },
  { type: "CARD_FROZEN", label: "Card frozen", description: "Sent when a card is frozen.", group: "Cards", variables: ["last4"] },
  { type: "CARD_UNFROZEN", label: "Card unfrozen", description: "Sent when a card is unfrozen.", group: "Cards", variables: ["last4"] },
  { type: "CARD_TERMINATED", label: "Card terminated", description: "Sent when a card is permanently closed.", group: "Cards", variables: ["last4"] },
  { type: "CARD_TRANSACTION", label: "Card purchase", description: "Sent when a card transaction completes.", group: "Cards", variables: ["amount", "currency", "merchant"] },
  { type: "BUSINESS_SPEND_CARD_ISSUED", label: "Business Spend Card issued", description: "Sent when a new Business Spend Card is issued.", group: "Business Spend Cards", variables: ["maskedPan"] },
  { type: "BUSINESS_SPEND_CARD_ACTIVATED", label: "Business Spend Card activated", description: "Sent when a Business Spend Card is activated.", group: "Business Spend Cards", variables: ["maskedPan"] },
  { type: "BUSINESS_SPEND_CARD_SUSPENDED", label: "Business Spend Card suspended", description: "Sent when a Business Spend Card is suspended.", group: "Business Spend Cards", variables: ["maskedPan"] },
  { type: "BUSINESS_SPEND_CARD_TERMINATED", label: "Business Spend Card terminated", description: "Sent when a Business Spend Card is permanently closed.", group: "Business Spend Cards", variables: ["maskedPan"] },
  { type: "TWO_FACTOR_ENABLED", label: "Two-factor authentication enabled", description: "Security notice sent when 2FA is turned on.", group: "Security", variables: [] },
  { type: "TWO_FACTOR_DISABLED", label: "Two-factor authentication disabled", description: "Security notice sent when 2FA is turned off.", group: "Security", variables: [] },
  { type: "PASSKEY_ADDED", label: "Passkey added", description: "Security notice sent when a new passkey is registered.", group: "Security", variables: ["passkeyName"] },
  { type: "PASSKEY_REMOVED", label: "Passkey removed", description: "Security notice sent when a passkey is removed.", group: "Security", variables: ["passkeyName"] },
];

export const notificationSettingsSchema = z.object({
  disabledTypes: z.array(emailNotificationTypeSchema),
  updatedAt: z.string(),
});
export type NotificationSettingsDto = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsSchema = z.object({
  disabledTypes: z.array(emailNotificationTypeSchema),
});
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;

export const emailTemplateSchema = z.object({
  type: emailNotificationTypeSchema,
  subject: z.string(),
  bodyHtml: z.string(),
  updatedAt: z.string(),
});
export type EmailTemplateDto = z.infer<typeof emailTemplateSchema>;

export const updateEmailTemplateSchema = z.object({
  subject: z.string().min(1).max(200),
  bodyHtml: z.string().min(1),
});
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;

// ── In-app notification center ──

export const notificationSchema = z.object({
  id: z.string(),
  type: emailNotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

// ── Web push subscriptions ──

export const pushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});
export type PushSubscriptionRequest = z.infer<typeof pushSubscriptionRequestSchema>;

// ── Notification channels (SMS / WhatsApp / Slack / Telegram / web push) admin settings ──

export const WHATSAPP_PROVIDERS = ["meta", "twilio", "custom_webhook"] as const;
export const whatsappProviderSchema = z.enum(WHATSAPP_PROVIDERS);
export type WhatsAppProviderKind = z.infer<typeof whatsappProviderSchema>;

export const notificationChannelSettingsSchema = z.object({
  webPush: z.object({
    vapidPublicKey: z.string(),
    vapidSubject: z.string(),
  }),
  sms: z.object({
    enabled: z.boolean(),
    twilioAccountSid: z.string(),
    twilioAuthTokenConfigured: z.boolean(),
    twilioFromNumber: z.string(),
  }),
  whatsapp: z.object({
    enabled: z.boolean(),
    provider: whatsappProviderSchema,
    metaPhoneNumberId: z.string(),
    metaAccessTokenConfigured: z.boolean(),
    twilioFromNumber: z.string(),
    customWebhookUrl: z.string(),
    customWebhookAuthHeaderConfigured: z.boolean(),
  }),
  slack: z.object({
    enabled: z.boolean(),
    webhookUrlConfigured: z.boolean(),
  }),
  telegram: z.object({
    enabled: z.boolean(),
    botTokenConfigured: z.boolean(),
    chatId: z.string(),
  }),
});
export type NotificationChannelSettingsDto = z.infer<typeof notificationChannelSettingsSchema>;

export const updateNotificationChannelSettingsSchema = z.object({
  webPush: z.object({
    vapidSubject: z.string(),
  }),
  sms: z.object({
    enabled: z.boolean(),
    twilioAccountSid: z.string(),
    /** Omit (or send empty) to keep the previously-saved token. */
    twilioAuthToken: z.string().optional(),
    twilioFromNumber: z.string(),
  }),
  whatsapp: z.object({
    enabled: z.boolean(),
    provider: whatsappProviderSchema,
    metaPhoneNumberId: z.string(),
    metaAccessToken: z.string().optional(),
    twilioFromNumber: z.string(),
    customWebhookUrl: z.string(),
    customWebhookAuthHeader: z.string().optional(),
  }),
  slack: z.object({
    enabled: z.boolean(),
    webhookUrl: z.string().optional(),
  }),
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string().optional(),
    chatId: z.string(),
  }),
});
export type UpdateNotificationChannelSettingsInput = z.infer<typeof updateNotificationChannelSettingsSchema>;
