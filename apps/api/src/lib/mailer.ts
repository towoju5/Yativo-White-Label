import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import logger from "./logger.js";

export type MailMode = "sendmail" | "smtp";

/** Mutable — updated in place by integrationRuntimeConfig.ts when the admin saves email settings. Defaults from env at boot. */
export const smtpConfig = {
  mode: env.EMAIL_MODE as MailMode,
  sendmailPath: env.SENDMAIL_PATH,
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  user: env.SMTP_USER,
  password: env.SMTP_PASSWORD,
  fromAddress: env.EMAIL_FROM_ADDRESS,
};

let transporter: Transporter | null = null;

/** Invalidates the cached transporter so the next sendMail() rebuilds it from the current smtpConfig. */
export function resetTransporter(): void {
  transporter = null;
}

/** Returns null (rather than throwing) when the selected mode isn't usable — only possible for "smtp" with no host set — so email sending degrades to a logged no-op instead of crashing whatever business flow triggered it. "sendmail" mode never returns null here since there's no config to validate up front; a missing/broken `sendmail` binary instead surfaces as a thrown error from t.sendMail(). */
function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (smtpConfig.mode === "sendmail") {
    transporter = nodemailer.createTransport({ sendmail: true, newline: "unix", path: smtpConfig.sendmailPath || "sendmail" });
    return transporter;
  }
  if (!smtpConfig.host) return null;
  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.password } : undefined,
  });
  return transporter;
}

export type MailAttachment = { filename: string; contentBase64: string; contentType: string };

/** Returns false (not configured — no attempt made, `t.sendMail` never called) or true (an attempt was made; throws on failure rather than swallowing it, so a caller that needs to know why can catch a real error). Callers that must never fail the business action that triggered them (see sendNotificationEmail) already wrap this in their own try/catch and ignore both the return value and any thrown error. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to: opts.to, subject: opts.subject }, "SMTP isn't configured (SMTP_HOST unset) — email not sent");
    return false;
  }
  await t.sendMail({
    from: smtpConfig.fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
    attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, "base64"), contentType: a.contentType })),
  });
  return true;
}

/** Alias for sendMail matching the common `sendEmail({ to, subject, text, html })` shape. */
export const sendEmail = sendMail;
