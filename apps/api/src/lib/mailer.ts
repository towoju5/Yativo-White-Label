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

/**
 * Picks the transport in priority order: SMTP when a host is configured (admin settings, else the
 * SMTP_* env vars — see integrationRuntimeConfig.ts), otherwise the local sendmail binary as the
 * fallback. Never returns null now that sendmail always backs up an unconfigured SMTP; a missing
 * or broken sendmail binary surfaces as a thrown error from t.sendMail() (logged as email.failed).
 */
function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (smtpConfig.mode === "smtp" && smtpConfig.host) {
    logger.info({ mode: "smtp", host: smtpConfig.host, port: smtpConfig.port, secure: smtpConfig.secure, user: smtpConfig.user, from: smtpConfig.fromAddress }, "email.transport");
    transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.password } : undefined,
    });
    return transporter;
  }
  const path = smtpConfig.sendmailPath || "sendmail";
  const fallback = smtpConfig.mode === "smtp";
  logger.info({ mode: "sendmail", path, from: smtpConfig.fromAddress, fallback }, fallback ? "email.transport (SMTP not configured, falling back to sendmail)" : "email.transport");
  transporter = nodemailer.createTransport({ sendmail: true, newline: "unix", path });
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
  const info = await t.sendMail({
    from: smtpConfig.fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
    attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, "base64"), contentType: a.contentType })),
  });
  // The receiving server's own acceptance (e.g. "250 2.0.0 OK ... - gsmtp") is the proof of
  // delivery to grep for. An address in `rejected` means the server refused that recipient even
  // though the send as a whole didn't throw.
  logger.info(
    { to: opts.to, subject: opts.subject, mode: smtpConfig.mode, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response },
    info.rejected?.length ? "email.rejected" : "email.sent",
  );
  return true;
}

/** Alias for sendMail matching the common `sendEmail({ to, subject, text, html })` shape. */
export const sendEmail = sendMail;
