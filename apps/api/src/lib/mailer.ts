import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import logger from "./logger.js";

let transporter: Transporter | null = null;

/** Returns null (rather than throwing) when SMTP isn't configured, so email sending degrades to a logged no-op instead of crashing whatever business flow triggered it. */
function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to: opts.to, subject: opts.subject }, "SMTP isn't configured (SMTP_HOST unset) — email not sent");
    return;
  }
  await t.sendMail({ from: env.EMAIL_FROM_ADDRESS, to: opts.to, subject: opts.subject, html: opts.html });
}
