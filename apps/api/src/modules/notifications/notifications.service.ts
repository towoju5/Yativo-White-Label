import type { PrismaClient } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { EMAIL_NOTIFICATION_TYPES, type EmailNotificationType, type UpdateNotificationSettingsInput, type UpdateEmailTemplateInput } from "@white-label/shared-types";
import { getBranding } from "../branding/branding.service.js";
import { renderTemplate } from "../../lib/renderTemplate.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import logger from "../../lib/logger.js";

// Same allowlist StaticPage uses for admin-authored HTML (see pages.service.ts), plus `style` —
// inline styles are how plain HTML emails get any layout at all, since most mail clients strip
// <style> blocks and ignore external stylesheets entirely.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "a", "img", "blockquote", "code", "pre", "table", "thead", "tbody",
    "tr", "td", "th", "div", "span", "center",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class", "style"],
    img: ["src", "alt", "width", "height", "class", "style"],
    "*": ["class", "style", "align"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function wrap(bodyInner: string): string {
  return `<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 17px; font-weight: 600; margin: 0 0 20px;">{{productName}}</p>
  ${bodyInner}
  <p style="margin-top: 32px; font-size: 12px; color: #888;">This is an automated message from {{productName}}.</p>
</div>`;
}

/** Hardcoded fallback used whenever no admin override row exists for a type — see listEmailTemplates/getEffectiveTemplate. */
const EMAIL_DEFAULTS: Record<EmailNotificationType, { subject: string; bodyHtml: string }> = {
  WELCOME: {
    subject: "Welcome to {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your account is ready. Glad to have you on board.</p>`),
  },
  KYC_APPROVED: {
    subject: "You're verified — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your identity verification has been approved. You now have full access to your account.</p>`),
  },
  KYC_REJECTED: {
    subject: "Action needed on your verification — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>We weren't able to approve your identity verification.</p><p><strong>Reason:</strong> {{reason}}</p><p>Please review and resubmit your details.</p>`),
  },
  DEPOSIT_RECEIVED: {
    subject: "Deposit received — {{amount}} {{currency}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>We've received your deposit of <strong>{{amount}} {{currency}}</strong>. It's now available in your wallet.</p>`),
  },
  PAYOUT_CREATED: {
    subject: "Payout submitted — {{amount}} {{currency}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your payout of <strong>{{amount}} {{currency}}</strong> has been submitted and is on its way.</p>`),
  },
  PAYOUT_COMPLETED: {
    subject: "Payout completed — {{amount}} {{currency}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your payout of <strong>{{amount}} {{currency}}</strong> has completed successfully.</p>`),
  },
  PAYOUT_FAILED: {
    subject: "Payout failed — {{amount}} {{currency}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your payout of <strong>{{amount}} {{currency}}</strong> couldn't be completed and the funds have been returned to your wallet.</p><p><strong>Reason:</strong> {{reason}}</p>`),
  },
  CARD_ISSUED: {
    subject: "Your new card is ready — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your new virtual card ending in <strong>{{last4}}</strong> is ready to use.</p>`),
  },
  CARD_FROZEN: {
    subject: "Card frozen — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your card ending in <strong>{{last4}}</strong> has been frozen. Unfreeze it any time from your dashboard.</p>`),
  },
  CARD_UNFROZEN: {
    subject: "Card unfrozen — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your card ending in <strong>{{last4}}</strong> has been unfrozen and is ready to use again.</p>`),
  },
  CARD_TERMINATED: {
    subject: "Card terminated — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your card ending in <strong>{{last4}}</strong> has been permanently closed.</p>`),
  },
  CARD_TRANSACTION: {
    subject: "Card purchase — {{amount}} {{currency}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>A purchase of <strong>{{amount}} {{currency}}</strong> at {{merchant}} was made on your card.</p>`),
  },
  SWAP_COMPLETED: {
    subject: "Currency swap completed — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Your swap of <strong>{{sourceAmount}} {{sourceCurrency}}</strong> to <strong>{{targetAmount}} {{targetCurrency}}</strong> has completed.</p>`),
  },
  TWO_FACTOR_ENABLED: {
    subject: "Two-factor authentication enabled — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Two-factor authentication was just turned on for your account. If this wasn't you, contact support immediately.</p>`),
  },
  TWO_FACTOR_DISABLED: {
    subject: "Two-factor authentication disabled — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>Two-factor authentication was just turned off for your account. If this wasn't you, contact support immediately.</p>`),
  },
  PASSKEY_ADDED: {
    subject: "New passkey added — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>A new passkey ("{{passkeyName}}") was just added to your account. If this wasn't you, contact support immediately.</p>`),
  },
  PASSKEY_REMOVED: {
    subject: "Passkey removed — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>The passkey "{{passkeyName}}" was just removed from your account. If this wasn't you, contact support immediately.</p>`),
  },
  BENEFICIARY_ADDED: {
    subject: "New beneficiary added — {{productName}}",
    bodyHtml: wrap(`<p>Hi {{firstName}},</p><p>"{{beneficiaryName}}" was just added as a payout beneficiary on your account.</p>`),
  },
};

function settingsToDto(s: { disabledTypes: EmailNotificationType[]; updatedAt: Date }) {
  return { disabledTypes: s.disabledTypes, updatedAt: s.updatedAt.toISOString() };
}

/** Create-on-read singleton, same pattern as BrandingConfig — every email type starts enabled. */
export async function getNotificationSettings(prisma: PrismaClient) {
  const settings = await prisma.notificationSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return settingsToDto(settings);
}

export async function updateNotificationSettings(prisma: PrismaClient, input: UpdateNotificationSettingsInput) {
  const settings = await prisma.notificationSettings.upsert({
    where: { id: 1 },
    update: { disabledTypes: input.disabledTypes },
    create: { id: 1, disabledTypes: input.disabledTypes },
  });
  return settingsToDto(settings);
}

function templateToDto(t: { type: EmailNotificationType; subject: string; bodyHtml: string; updatedAt: Date }) {
  return { type: t.type, subject: t.subject, bodyHtml: t.bodyHtml, updatedAt: t.updatedAt.toISOString() };
}

/** Ensures a row exists for every catalog type (seeded with the built-in default on first read) so the admin editor always has all 18 templates to show and edit in place. */
export async function listEmailTemplates(prisma: PrismaClient) {
  const templates = await Promise.all(
    EMAIL_NOTIFICATION_TYPES.map((type) =>
      prisma.emailTemplate.upsert({
        where: { type },
        update: {},
        create: { type, subject: EMAIL_DEFAULTS[type].subject, bodyHtml: EMAIL_DEFAULTS[type].bodyHtml },
      }),
    ),
  );
  return templates.map(templateToDto);
}

export async function updateEmailTemplate(prisma: PrismaClient, type: EmailNotificationType, input: UpdateEmailTemplateInput) {
  const template = await prisma.emailTemplate.upsert({
    where: { type },
    update: { subject: input.subject, bodyHtml: sanitizeEmailHtml(input.bodyHtml) },
    create: { type, subject: input.subject, bodyHtml: sanitizeEmailHtml(input.bodyHtml) },
  });
  return templateToDto(template);
}

/** Renders a type's effective template (admin override if one exists, else the built-in default) against sample data — used by the "send test" admin action, never by a real customer send. */
export async function renderSampleEmail(prisma: PrismaClient, type: EmailNotificationType) {
  const [row, branding] = await Promise.all([prisma.emailTemplate.findUnique({ where: { type } }), getBranding(prisma)]);
  const template = row ? { subject: row.subject, bodyHtml: row.bodyHtml } : EMAIL_DEFAULTS[type];
  const sampleVars: Record<string, string> = {
    firstName: "Alex",
    productName: branding.productName,
    reason: "Document image was too blurry to read",
    amount: "250.00",
    currency: "USD",
    sourceAmount: "100.00",
    sourceCurrency: "USD",
    targetAmount: "92.30",
    targetCurrency: "EUR",
    last4: "4242",
    merchant: "Example Store",
    passkeyName: "MacBook Touch ID",
    beneficiaryName: "Jane's Checking Account",
  };
  return { subject: renderTemplate(template.subject, sampleVars), html: renderTemplate(template.bodyHtml, sampleVars) };
}

/**
 * The one function every customer-action hook site calls. Never throws — a notification failure
 * (missing SMTP config, a bad template, a DB hiccup) must never fail the business action that
 * triggered it, so every error is logged and swallowed here rather than propagated to the caller.
 */
export async function sendNotificationEmail(
  prisma: PrismaClient,
  type: EmailNotificationType,
  customerId: string,
  vars: Record<string, string>,
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return;

    const settings = await getNotificationSettings(prisma);
    if (settings.disabledTypes.includes(type)) return;

    const [row, branding] = await Promise.all([prisma.emailTemplate.findUnique({ where: { type } }), getBranding(prisma)]);
    const template = row ? { subject: row.subject, bodyHtml: row.bodyHtml } : EMAIL_DEFAULTS[type];

    const firstName = customer.fullName?.split(" ")[0] || customer.businessName || "there";
    const allVars = { ...vars, firstName, productName: branding.productName };

    await enqueueEmail({
      to: customer.email,
      subject: renderTemplate(template.subject, allVars),
      html: renderTemplate(template.bodyHtml, allVars),
    });
  } catch (err) {
    logger.error({ err, type, customerId }, "Couldn't send notification email");
  }
}
