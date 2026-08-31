import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import logger from "./logger.js";

/** Mutable — updated in place by integrationRuntimeConfig.ts when the admin saves SMTP settings. Defaults from env at boot. */
export const smtpConfig = {
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

/** Returns null (rather than throwing) when SMTP isn't configured, so email sending degrades to a logged no-op instead of crashing whatever business flow triggered it. */
function getTransporter(): Transporter | null {
  if (!smtpConfig.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.password } : undefined,
    });
  }
  return transporter;
}

export type MailAttachment = { filename: string; contentBase64: string; contentType: string };

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to: opts.to, subject: opts.subject }, "SMTP isn't configured (SMTP_HOST unset) — email not sent");
    return;
  }
  await t.sendMail({
    from: smtpConfig.fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
    attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, "base64"), contentType: a.contentType })),
  });
}
