import type { PrismaClient } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { EMAIL_NOTIFICATION_TYPES, EMAIL_NOTIFICATION_CATALOG, isAuthEmailType, type AuthEmailType, type EmailNotificationType, type UpdateNotificationSettingsInput, type UpdateEmailTemplateInput } from "@white-label/shared-types";
import { getBranding } from "../branding/branding.service.js";
import { renderTemplate } from "../../lib/renderTemplate.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { sendWebPush } from "./channels/webPush.js";
import { sendSms } from "./channels/sms.js";
import { sendWhatsApp } from "./channels/whatsapp/index.js";
import { sendOpsAlert } from "./channels/opsAlert.js";
import logger from "../../lib/logger.js";

/**
 * Real money movement only (matches the "Money movement" group in EMAIL_NOTIFICATION_CATALOG,
 * minus BENEFICIARY_ADDED — adding a beneficiary moves no money) plus CARD_TRANSACTION, which
 * carries an amount too but lives in a different catalog group. Lifecycle/security notifications
 * (card frozen, 2FA, passkeys, KYC, welcome) are deliberately excluded — they'd just be noise on
 * an ops channel meant for "did money move" visibility.
 */
const TRANSACTION_SUMMARY_TYPES: EmailNotificationType[] = [
  "DEPOSIT_CREATED",
  "DEPOSIT_RECEIVED",
  "PAYOUT_CREATED",
  "PAYOUT_COMPLETED",
  "PAYOUT_FAILED",
  "SWAP_COMPLETED",
  "CARD_TRANSACTION",
];

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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * `{{brandMark}}`/`{{brandColorFrom}}`/`{{brandColorTo}}` — filled in from the admin's actual
 * Branding settings (not sanitized through sanitizeEmailHtml, since that only runs on a template
 * at *save* time, not on these vars at *send* time) — escaped here instead, since productName is
 * admin-controlled free text that ends up directly in the HTML. Mirrors the web app's BrandLogo
 * component: the logo replaces the product-name text entirely once one is set, never both at once.
 */
function buildBrandVars(branding: { productName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string }): Record<string, string> {
  const brandMark = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.productName)}" style="max-height: 40px; max-width: 240px; width: auto; height: auto; display: inline-block;" />`
    : `<span style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #111827;">${escapeHtml(branding.productName)}</span>`;
  return {
    brandMark,
    brandColorFrom: branding.primaryColor,
    brandColorTo: branding.secondaryColor,
  };
}

type DetailTone = "neutral" | "success" | "warning" | "danger";

const TONE_COLORS: Record<DetailTone, { bg: string; border: string; label: string; value: string }> = {
  neutral: { bg: "#f3f4f6", border: "#e5e7eb", label: "#6b7280", value: "#111827" },
  success: { bg: "#f0fdf4", border: "#bbf7d0", label: "#166534", value: "#14532d" },
  warning: { bg: "#fffbeb", border: "#fde68a", label: "#92400e", value: "#78350f" },
  danger: { bg: "#fef2f2", border: "#fecaca", label: "#991b1b", value: "#7f1d1d" },
};

type EmailTemplateSpec = {
  /** A single emoji, shown in the header's icon circle. */
  icon: string;
  /** Header title, next to the icon. */
  heading: string;
  /** First paragraph, right under the "Hi {{firstName}}," greeting. May contain inline HTML (e.g. <strong>). */
  intro: string;
  /** Optional colored callout box (e.g. an amount, a reason, a card's last 4). */
  detail?: { label: string; value: string; tone?: DetailTone };
  /** Optional paragraph after the detail box — e.g. a call to action in prose, or a reason. */
  extra?: string;
  /** Optional button — href may be a mailto: link. */
  cta?: { label: string; href: string };
  /** Optional one-time code, shown large and centered (sign-in verification emails). */
  code?: string;
  /** Optional plain-text copy of the CTA's URL under the button, for mail clients that block or mangle buttons. */
  linkFallback?: string;
};

/**
 * Every transactional email shares this table-based layout (required for consistent rendering
 * across email clients, most of which strip <style> blocks and ignore CSS classes) — a brand bar
 * (logo or product name) above a colored icon header, a body with an optional callout box and CTA
 * button, and a footer. `{{productName}}`, `{{firstName}}`, `{{brandMark}}`, `{{brandColorFrom}}`,
 * `{{brandColorTo}}` are always available (filled in from the admin's actual branding at send
 * time — see buildBrandVars below); other vars are per-type, see EMAIL_NOTIFICATION_CATALOG in
 * shared-types.
 */
function buildEmailTemplate(spec: EmailTemplateSpec): string {
  const tone = TONE_COLORS[spec.detail?.tone ?? "neutral"];
  const font = "-apple-system, Helvetica, Arial, sans-serif";

  return `<table align="center" style="width: 100%; margin: 0 auto; background-color: #f4f5f7;">
  <tr>
    <td align="center" style="padding: 40px 16px;">
      <table align="center" style="width: 100%; max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="padding: 24px 32px 8px; text-align: center;">{{brandMark}}</td>
        </tr>
        <tr>
          <td style="background: linear-gradient(135deg, {{brandColorFrom}}, {{brandColorTo}}); padding: 28px 32px; text-align: center;">
            <table align="center" style="margin: 0 auto;">
              <tr>
                <td style="width: 48px; height: 48px; background-color: rgba(255,255,255,0.2); border-radius: 50%; text-align: center; vertical-align: middle; line-height: 48px; font-size: 24px;">${spec.icon}</td>
              </tr>
            </table>
            <p style="margin: 12px 0 0; font-family: ${font}; font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px;">${spec.heading}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 32px 8px;">
            <p style="margin: 0 0 4px; font-family: ${font}; font-size: 13px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">{{productName}}</p>
            <p style="margin: 0 0 20px; font-family: ${font}; font-size: 20px; font-weight: 700; color: #111827; letter-spacing: -0.3px;">Hi {{firstName}},</p>
            <p style="margin: 0 0 20px; font-family: ${font}; font-size: 15px; line-height: 1.65; color: #374151;">${spec.intro}</p>
            ${
              spec.code
                ? `<table style="width: 100%; background-color: #f9fafb; border: 1px dashed #d1d5db; border-radius: 10px; margin-bottom: 24px;">
              <tr>
                <td align="center" style="padding: 20px 16px; font-family: 'SF Mono', SFMono-Regular, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${spec.code}</td>
              </tr>
            </table>`
                : ""
            }
            ${
              spec.detail
                ? `<table style="width: 100%; background-color: ${tone.bg}; border: 1px solid ${tone.border}; border-radius: 8px; margin-bottom: 24px;">
              <tr>
                <td style="padding: 16px 20px;">
                  <table style="width: 100%;">
                    <tr>
                      <td style="font-family: ${font}; font-size: 12px; font-weight: 600; color: ${tone.label}; text-transform: uppercase; letter-spacing: 0.4px; padding-bottom: 6px;">${spec.detail.label}</td>
                    </tr>
                    <tr>
                      <td style="font-family: 'SF Mono', SFMono-Regular, Consolas, monospace; font-size: 14px; font-weight: 600; color: ${tone.value}; word-break: break-all;">${spec.detail.value}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>`
                : ""
            }
            ${spec.extra ? `<p style="margin: 0 0 28px; font-family: ${font}; font-size: 15px; line-height: 1.65; color: #374151;">${spec.extra}</p>` : ""}
            ${
              spec.cta
                ? `<table align="center" style="width: 100%; margin: 0 auto; margin-bottom: 8px;">
              <tr>
                <td align="center" style="border-radius: 8px; background-color: {{brandColorFrom}};">
                  <a href="${spec.cta.href}" target="_blank" style="display: inline-block; padding: 12px 32px; font-family: ${font}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: {{brandColorFrom}};" rel="noopener noreferrer">${spec.cta.label}</a>
                </td>
              </tr>
            </table>`
                : ""
            }
            ${
              spec.linkFallback
                ? `<p style="margin: 16px 0 8px; font-family: ${font}; font-size: 12px; line-height: 1.6; color: #6b7280; text-align: center;">Button not working? Copy and paste this link into your browser:<br /><a href="${spec.linkFallback}" style="color: {{brandColorFrom}}; word-break: break-all;">${spec.linkFallback}</a></p>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td style="padding: 0 32px;">
            <table style="width: 100%;">
              <tr>
                <td style="border-top: 1px solid #e5e7eb; font-size: 1px; line-height: 1px;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 32px 28px; text-align: center;">
            <p style="margin: 0 0 4px; font-family: ${font}; font-size: 12px; color: #9ca3af; line-height: 1.5;">This is an automated message from {{productName}}.</p>
            <p style="margin: 0; font-family: ${font}; font-size: 12px; color: #9ca3af; line-height: 1.5;">Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

const CONTACT_SUPPORT_CTA = { label: "Contact Support", href: "mailto:{{supportEmail}}" };
const CONTACT_SUPPORT_TEXT = "If this wasn't you, <strong>contact support immediately</strong> to secure your account.";

/** Hardcoded fallback used whenever no admin override row exists for a type — see listEmailTemplates/getEffectiveTemplate. */
const EMAIL_DEFAULTS: Record<EmailNotificationType, { subject: string; bodyHtml: string }> = {
  WELCOME: {
    subject: "Welcome to {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "👋",
      heading: "Welcome",
      intro: "Your account is ready. Glad to have you on board.",
    }),
  },
  KYC_APPROVED: {
    subject: "You're verified — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "✅",
      heading: "Verification Approved",
      intro: "Your identity verification has been approved. You now have full access to your account.",
    }),
  },
  KYC_REJECTED: {
    subject: "Action needed on your verification — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "⚠️",
      heading: "Verification Update",
      intro: "We weren't able to approve your identity verification.",
      detail: { label: "Reason", value: "{{reason}}", tone: "warning" },
      extra: "Please review and resubmit your details.",
    }),
  },
  DEPOSIT_CREATED: {
    subject: "Deposit submitted — {{amount}} {{currency}}",
    bodyHtml: buildEmailTemplate({
      icon: "⏳",
      heading: "Deposit Submitted",
      intro: "We've received your deposit request. We'll email you again once it's confirmed and available in your wallet.",
      detail: { label: "Amount", value: "{{amount}} {{currency}}" },
    }),
  },
  DEPOSIT_RECEIVED: {
    subject: "Deposit received — {{amount}} {{currency}}",
    bodyHtml: buildEmailTemplate({
      icon: "💰",
      heading: "Deposit Received",
      intro: "We've received your deposit. It's now available in your wallet.",
      detail: { label: "Amount", value: "{{amount}} {{currency}}", tone: "success" },
    }),
  },
  PAYOUT_CREATED: {
    subject: "Payout submitted — {{amount}} {{currency}}",
    bodyHtml: buildEmailTemplate({
      icon: "📤",
      heading: "Payout Submitted",
      intro: "Your payout has been submitted and is on its way.",
      detail: { label: "Amount", value: "{{amount}} {{currency}}" },
    }),
  },
  PAYOUT_COMPLETED: {
    subject: "Payout completed — {{amount}} {{currency}}",
    bodyHtml: buildEmailTemplate({
      icon: "✅",
      heading: "Payout Completed",
      intro: "Your payout has completed successfully.",
      detail: { label: "Amount", value: "{{amount}} {{currency}}", tone: "success" },
    }),
  },
  PAYOUT_FAILED: {
    subject: "Payout failed — {{amount}} {{currency}}",
    bodyHtml: buildEmailTemplate({
      icon: "❌",
      heading: "Payout Failed",
      intro: "Your payout couldn't be completed and the funds have been returned to your wallet.",
      detail: { label: "Amount", value: "{{amount}} {{currency}}", tone: "danger" },
      extra: "<strong>Reason:</strong> {{reason}}",
    }),
  },
  CARD_ISSUED: {
    subject: "Your new virtual card is ready — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "💳",
      heading: "Virtual Card Issued",
      intro: "Your new virtual card is ready to use.",
      detail: { label: "Card", value: "•••• {{last4}}" },
    }),
  },
  CARD_FROZEN: {
    subject: "Virtual card frozen — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🧊",
      heading: "Virtual Card Frozen",
      intro: "Your virtual card has been frozen. Unfreeze it any time from your dashboard.",
      detail: { label: "Card", value: "•••• {{last4}}", tone: "warning" },
    }),
  },
  CARD_UNFROZEN: {
    subject: "Virtual card unfrozen — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🔓",
      heading: "Virtual Card Unfrozen",
      intro: "Your virtual card has been unfrozen and is ready to use again.",
      detail: { label: "Card", value: "•••• {{last4}}", tone: "success" },
    }),
  },
  CARD_TERMINATED: {
    subject: "Virtual card terminated — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🗑️",
      heading: "Virtual Card Terminated",
      intro: "Your virtual card has been permanently closed.",
      detail: { label: "Card", value: "•••• {{last4}}", tone: "danger" },
    }),
  },
  CARD_TRANSACTION: {
    subject: "Virtual card purchase — {{amount}} {{currency}}",
    bodyHtml: buildEmailTemplate({
      icon: "🛍️",
      heading: "Virtual Card Purchase",
      intro: "A purchase was made on your virtual card at {{merchant}}.",
      detail: { label: "Amount", value: "{{amount}} {{currency}}" },
    }),
  },
  BUSINESS_SPEND_CARD_ISSUED: {
    subject: "Your Business Card is ready — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "💳",
      heading: "Business Card Issued",
      intro: "Your new Business Card is ready to use.",
      detail: { label: "Card", value: "{{maskedPan}}" },
    }),
  },
  BUSINESS_SPEND_CARD_ACTIVATED: {
    subject: "Business Card activated — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🔓",
      heading: "Business Card Activated",
      intro: "Your Business Card has been activated and is ready to use.",
      detail: { label: "Card", value: "{{maskedPan}}", tone: "success" },
    }),
  },
  BUSINESS_SPEND_CARD_SUSPENDED: {
    subject: "Business Card suspended — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🧊",
      heading: "Business Card Suspended",
      intro: "Your Business Card has been suspended. Reactivate it any time from your dashboard.",
      detail: { label: "Card", value: "{{maskedPan}}", tone: "warning" },
    }),
  },
  BUSINESS_SPEND_CARD_TERMINATED: {
    subject: "Business Card terminated — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🗑️",
      heading: "Business Card Terminated",
      intro: "Your Business Card has been permanently closed.",
      detail: { label: "Card", value: "{{maskedPan}}", tone: "danger" },
    }),
  },
  SWAP_COMPLETED: {
    subject: "Currency swap completed — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🔄",
      heading: "Swap Completed",
      intro: "Your currency swap has completed.",
      detail: { label: "Converted", value: "{{sourceAmount}} {{sourceCurrency}} → {{targetAmount}} {{targetCurrency}}" },
    }),
  },
  TWO_FACTOR_ENABLED: {
    subject: "Two-factor authentication enabled — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🔐",
      heading: "Two-Factor Enabled",
      intro: "Two-factor authentication was just turned on for your account.",
      extra: CONTACT_SUPPORT_TEXT,
      cta: CONTACT_SUPPORT_CTA,
    }),
  },
  TWO_FACTOR_DISABLED: {
    subject: "Security Alert — Two-factor authentication disabled",
    bodyHtml: buildEmailTemplate({
      icon: "🛡️",
      heading: "Security Alert",
      intro: "Two-factor authentication was just turned off for your account.",
      extra: CONTACT_SUPPORT_TEXT,
      cta: CONTACT_SUPPORT_CTA,
    }),
  },
  PASSKEY_ADDED: {
    subject: "New passkey added — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🔑",
      heading: "Passkey Added",
      intro: "A new passkey was just added to your account. Here are the details:",
      detail: { label: "Added Passkey", value: '"{{passkeyName}}"', tone: "success" },
      extra: CONTACT_SUPPORT_TEXT,
      cta: CONTACT_SUPPORT_CTA,
    }),
  },
  PASSKEY_REMOVED: {
    subject: "Security Alert — Passkey removed",
    bodyHtml: buildEmailTemplate({
      icon: "🛡️",
      heading: "Security Alert",
      intro: "A passkey was just removed from your account. Here are the details:",
      detail: { label: "Removed Passkey", value: '"{{passkeyName}}"', tone: "danger" },
      extra: "If you didn't authorize this change, your account may be compromised. <strong>Contact support immediately</strong> to secure your account.",
      cta: CONTACT_SUPPORT_CTA,
    }),
  },
  BENEFICIARY_ADDED: {
    subject: "New beneficiary added — {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "👤",
      heading: "Beneficiary Added",
      intro: '"{{beneficiaryName}}" was just added as a payout beneficiary on your account.',
    }),
  },
  MAGIC_LINK: {
    subject: "Your {{productName}} sign-in link",
    bodyHtml: buildEmailTemplate({
      icon: "✨",
      heading: "Sign in to {{productName}}",
      intro: "Tap the button below to sign in. No password needed.",
      cta: { label: "Sign in", href: "{{magicLinkUrl}}" },
      extra: "This link expires in <strong>15 minutes</strong> and can only be used once. If you didn't ask to sign in, you can safely ignore this email.",
      linkFallback: "{{magicLinkUrl}}",
    }),
  },
  EMAIL_VERIFICATION: {
    subject: "Verify your email for {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "✉️",
      heading: "Confirm your email",
      intro: "Please confirm this is your email address to finish setting up your account.",
      cta: { label: "Verify email address", href: "{{verifyUrl}}" },
      extra: "This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.",
      linkFallback: "{{verifyUrl}}",
    }),
  },
  PASSWORD_RESET: {
    subject: "Reset your {{productName}} password",
    bodyHtml: buildEmailTemplate({
      icon: "🔑",
      heading: "Reset your password",
      intro: "We received a request to reset your password. Choose a new one using the button below.",
      cta: { label: "Choose a new password", href: "{{resetUrl}}" },
      extra: "This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email. Your password won't change.",
      linkFallback: "{{resetUrl}}",
    }),
  },
  LOGIN_VERIFICATION_CODE: {
    subject: "{{code}} is your {{productName}} verification code",
    bodyHtml: buildEmailTemplate({
      icon: "📍",
      heading: "Verify this sign-in",
      intro: "We noticed a sign-in to your account from a location you haven't used before. Enter this code to continue:",
      code: "{{code}}",
      extra: "This code expires in <strong>10 minutes</strong>. If this wasn't you, <strong>reset your password immediately</strong>.",
    }),
  },
  TEAM_INVITE: {
    subject: "You've been invited to join {{businessName}} on {{productName}}",
    bodyHtml: buildEmailTemplate({
      icon: "🤝",
      heading: "You're invited",
      intro: "<strong>{{businessName}}</strong> has invited you to join their team on {{productName}}.",
      cta: { label: "Accept invite", href: "{{acceptUrl}}" },
      extra: "You'll set your password when you accept. This invite expires in <strong>7 days</strong>.",
      linkFallback: "{{acceptUrl}}",
    }),
  },
  STAFF_INVITE: {
    subject: "You've been invited to the {{productName}} admin team",
    bodyHtml: buildEmailTemplate({
      icon: "🛠️",
      heading: "Join the admin team",
      intro: "You've been invited to join the {{productName}} admin team.",
      detail: { label: "Role", value: "{{role}}" },
      cta: { label: "Accept invite", href: "{{acceptUrl}}" },
      extra: "You'll set your password when you accept. This invite expires in <strong>7 days</strong>.",
      linkFallback: "{{acceptUrl}}",
    }),
  },
  STAFF_LOGIN_VERIFICATION_CODE: {
    subject: "{{code}} is your {{productName}} admin verification code",
    bodyHtml: buildEmailTemplate({
      icon: "📍",
      heading: "Verify this admin sign-in",
      intro: "We noticed a sign-in to your admin account from a location you haven't used before. Enter this code to continue:",
      code: "{{code}}",
      extra: "This code expires in <strong>10 minutes</strong>. If this wasn't you, <strong>contact another owner or admin immediately</strong>.",
    }),
  },
  STAFF_TWO_FACTOR_ENABLED: {
    subject: "Two-factor authentication enabled on your admin account",
    bodyHtml: buildEmailTemplate({
      icon: "🔐",
      heading: "2FA Enabled",
      intro: "Two-factor authentication was just turned on for your admin account.",
      detail: { label: "Status", value: "Protected", tone: "success" },
      extra: "If this wasn't you, contact another owner or admin immediately.",
    }),
  },
  STAFF_TWO_FACTOR_DISABLED: {
    subject: "Security Alert — Two-factor authentication disabled on your admin account",
    bodyHtml: buildEmailTemplate({
      icon: "⚠️",
      heading: "2FA Disabled",
      intro: "Two-factor authentication was just turned off for your admin account.",
      detail: { label: "Status", value: "Less protected", tone: "danger" },
      extra: "If this wasn't you, <strong>contact another owner or admin immediately</strong> to secure the account.",
    }),
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
    update: { disabledTypes: input.disabledTypes.filter((t) => !isAuthEmailType(t)) },
    create: { id: 1, disabledTypes: input.disabledTypes.filter((t) => !isAuthEmailType(t)) },
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

/**
 * Deletes the admin's saved row for one type, reverting it to whatever EMAIL_DEFAULTS[type] is in
 * the code right now — the same fallback listEmailTemplates/sendNotificationEmail already use for
 * a type with no row at all. This is the only way an already-saved template picks up a code-level
 * redesign: listEmailTemplates seeds a row on first read and never overwrites an existing one
 * (that's what protects a real admin customization), so a template saved before a template
 * redesign ships stays on the old design until explicitly reset.
 */
export async function resetEmailTemplate(prisma: PrismaClient, type: EmailNotificationType) {
  await prisma.emailTemplate.deleteMany({ where: { type } });
  const fallback = EMAIL_DEFAULTS[type];
  return { type, subject: fallback.subject, bodyHtml: fallback.bodyHtml, updatedAt: new Date().toISOString() };
}

/** Same as resetEmailTemplate, for every type at once. */
export async function resetAllEmailTemplates(prisma: PrismaClient) {
  await prisma.emailTemplate.deleteMany({});
  return listEmailTemplates(prisma);
}

export async function updateEmailTemplate(prisma: PrismaClient, type: EmailNotificationType, input: UpdateEmailTemplateInput) {
  const template = await prisma.emailTemplate.upsert({
    where: { type },
    update: { subject: input.subject, bodyHtml: sanitizeEmailHtml(input.bodyHtml) },
    create: { type, subject: input.subject, bodyHtml: sanitizeEmailHtml(input.bodyHtml) },
  });
  return templateToDto(template);
}

const AUTH_SAMPLE_VARS: Record<string, string> = {
  magicLinkUrl: "https://example.com/portal/magic-link?token=sample",
  verifyUrl: "https://example.com/portal/verify-email?token=sample",
  resetUrl: "https://example.com/portal/reset-password?token=sample",
  acceptUrl: "https://example.com/accept-invite?token=sample",
  code: "482913",
  businessName: "Acme Inc.",
  role: "Admin",
};

/** Renders a type's effective template (admin override if one exists, else the built-in default) against sample data — used by the "send test" admin action, never by a real customer send. */
export async function renderSampleEmail(prisma: PrismaClient, type: EmailNotificationType) {
  const [row, branding] = await Promise.all([prisma.emailTemplate.findUnique({ where: { type } }), getBranding(prisma)]);
  const template = row ? { subject: row.subject, bodyHtml: row.bodyHtml } : EMAIL_DEFAULTS[type];
  const sampleVars: Record<string, string> = {
    firstName: "Alex",
    productName: branding.productName,
    supportEmail: branding.supportEmail ?? "support@example.com",
    ...buildBrandVars(branding),
    reason: "Document image was too blurry to read",
    amount: "250.00",
    currency: "USD",
    sourceAmount: "100.00",
    sourceCurrency: "USD",
    targetAmount: "92.30",
    targetCurrency: "EUR",
    last4: "4242",
    maskedPan: "XXXX XXXX XXXX 4242",
    merchant: "Example Store",
    passkeyName: "MacBook Touch ID",
    beneficiaryName: "Jane's Checking Account",
    ...AUTH_SAMPLE_VARS,
  };
  return { subject: renderTemplate(template.subject, sampleVars), html: renderTemplate(template.bodyHtml, sampleVars) };
}

/**
 * The one function every customer-action hook site calls — despite the name (kept for the ~15
 * existing call sites), this now dispatches across every enabled channel for the customer, not
 * just email: it always persists an in-app Notification row, always attempts email, and fans out
 * to web push / SMS / WhatsApp for whichever channels are configured and available to this
 * customer (a push subscription on file, a phone number on file). Never throws — a notification
 * failure (missing SMTP config, a bad template, a DB hiccup, a down SMS provider) must never fail
 * the business action that triggered it, so every error is logged and swallowed here.
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
    const allVars = { ...vars, firstName, productName: branding.productName, supportEmail: branding.supportEmail ?? "", ...buildBrandVars(branding) };

    // The rendered subject already reads as a good one-line summary ("Deposit received — 250.00
    // USD") — reused as the in-app/push/SMS title so this doesn't need its own separate copy.
    const title = renderTemplate(template.subject, allVars);
    const body = EMAIL_NOTIFICATION_CATALOG.find((c) => c.type === type)?.description ?? title;

    // Ops visibility into real money movement — fire-and-forget, same as every other channel here;
    // see TRANSACTION_SUMMARY_TYPES' doc comment for why only these types qualify.
    if (TRANSACTION_SUMMARY_TYPES.includes(type)) {
      const who = customer.fullName ?? customer.businessName ?? customer.email;
      void sendOpsAlert(`💳 ${title} — ${who}`);
    }

    await Promise.all([
      enqueueEmail({ to: customer.email, subject: title, html: renderTemplate(template.bodyHtml, allVars) }),
      prisma.notification.create({ data: { customerId, type, title, body } }),
      sendWebPush(prisma, customerId, { title, body }),
      sendSms(customer.phone, { title, body }),
      sendWhatsApp(customer.phone, { title, body }),
    ]);
  } catch (err) {
    logger.error({ err, type, customerId }, "Couldn't send notification email");
  }
}

/**
 * Sends one of the AUTH_EMAIL_TYPES (sign-in links, verification codes, invites) using the admin's
 * saved template if there is one, else the built-in default. Unlike sendNotificationEmail this
 * goes to an arbitrary address (staff, invitees, not-yet-verified customers), skips every other
 * channel and the in-app notification row, ignores disabledTypes, and throws on enqueue failure so
 * each caller keeps its existing error posture.
 *
 * Every var is HTML-escaped: names, business names, and roles are user-entered, and the template
 * drops them straight into HTML. URLs survive escaping intact (`&` → `&amp;` is correct in href).
 */
export async function sendSystemEmail(
  prisma: PrismaClient,
  type: AuthEmailType,
  to: string,
  vars: Record<string, string> & { firstName?: string },
): Promise<void> {
  const [row, branding] = await Promise.all([prisma.emailTemplate.findUnique({ where: { type } }), getBranding(prisma)]);
  const template = row ? { subject: row.subject, bodyHtml: row.bodyHtml } : EMAIL_DEFAULTS[type];

  const textVars: Record<string, string> = {
    firstName: "there",
    productName: branding.productName,
    supportEmail: branding.supportEmail ?? "",
    ...vars,
  };
  const htmlVars: Record<string, string> = {
    ...Object.fromEntries(Object.entries(textVars).map(([k, v]) => [k, escapeHtml(v)])),
    ...buildBrandVars(branding),
  };

  await enqueueEmail({
    to,
    // Subjects are plain text headers, so they get the raw (unescaped) values.
    subject: renderTemplate(template.subject, textVars),
    html: renderTemplate(template.bodyHtml, htmlVars),
  });
}
