/**
 * Branded HTML for the "your demo is ready" email. Table-based layout with inline styles only —
 * the lowest common denominator that renders consistently across Gmail, Outlook, and Apple Mail
 * (none of which reliably honor <style> blocks, flexbox, or CSS variables).
 */

export type DemoEmailParams = {
  productName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  businessName: string;
  demoUrl: string;
  adminUrl: string;
  adminEmail: string;
  adminPassword: string;
  expiresAt: Date;
  durationHours: number;
};

/** Everything interpolated below that originated from the public request form (businessName) is untrusted, so every dynamic value goes through this. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Falls back to a neutral brand color when the stored value isn't a plain hex color, so a malformed branding row can't break (or inject into) the inline styles. */
function safeColor(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#4f46e5";
}

export function renderDemoReadyEmail(p: DemoEmailParams): { subject: string; html: string; text: string } {
  const brand = safeColor(p.primaryColor);
  const product = esc(p.productName);
  const business = esc(p.businessName);
  const demoUrl = esc(p.demoUrl);
  const adminUrl = esc(p.adminUrl);
  const expires = esc(p.expiresAt.toUTCString());
  const header = p.logoUrl
    ? `<img src="${esc(p.logoUrl)}" alt="${product}" height="32" style="display:block;height:32px;max-width:180px;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.01em;">${product}</span>`;
  const support = p.supportEmail
    ? `Questions? Reach us at <a href="mailto:${esc(p.supportEmail)}" style="color:${brand};text-decoration:none;">${esc(p.supportEmail)}</a>.`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>Your demo is ready</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your ${product} demo for ${business} is live for the next ${p.durationHours} hours.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px;">${header}</td></tr>
        <tr>
          <td style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(17,24,39,0.08);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:4px;background:${brand};font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:36px 36px 8px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${brand};">Demo ready</p>
                  <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700;color:#111827;">Your demo for ${business} is live</h1>
                  <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">We've set up a private, fully isolated environment with sample data so you can explore everything ${product} does. It stays active for <strong style="color:#111827;">${p.durationHours} hours</strong>.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 36px 8px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="border-radius:8px;background:${brand};">
                        <a href="${demoUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Open customer portal &rarr;</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">One click, no password: this link signs you straight in.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 36px 8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                    <tr>
                      <td style="padding:20px 22px;">
                        <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#111827;">Admin panel</p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.5;">
                          <tr>
                            <td style="padding:4px 0;width:92px;color:#6b7280;vertical-align:top;">URL</td>
                            <td style="padding:4px 0;word-break:break-all;"><a href="${adminUrl}" style="color:${brand};text-decoration:none;">${adminUrl}</a></td>
                          </tr>
                          <tr>
                            <td style="padding:4px 0;color:#6b7280;vertical-align:top;">Email</td>
                            <td style="padding:4px 0;font-family:SFMono-Regular,Menlo,Consolas,monospace;color:#111827;">${esc(p.adminEmail)}</td>
                          </tr>
                          <tr>
                            <td style="padding:4px 0;color:#6b7280;vertical-align:top;">Password</td>
                            <td style="padding:4px 0;font-family:SFMono-Regular,Menlo,Consolas,monospace;color:#111827;">${esc(p.adminPassword)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 36px 36px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid #f59e0b;background:#fffbeb;border-radius:0 8px 8px 0;">
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;line-height:1.55;color:#92400e;">
                        <strong>Expires ${expires}.</strong> All data, uploads, and settings in this demo are then permanently deleted. Nothing touches real accounts or real money.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">
            ${support}<br />
            You're receiving this because a demo was requested for ${business} with this address.<br />
            &copy; ${new Date().getUTCFullYear()} ${product}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `Your demo for ${p.businessName} is live`,
    "",
    `Your private ${p.productName} demo environment stays active for ${p.durationHours} hours (until ${p.expiresAt.toUTCString()}).`,
    "",
    "Customer portal (one click, no password):",
    p.demoUrl,
    "",
    "Admin panel:",
    p.adminUrl,
    `Email: ${p.adminEmail}`,
    `Password: ${p.adminPassword}`,
    "",
    "When the demo expires, all of its data, uploads, and settings are permanently deleted.",
    p.supportEmail ? `\nQuestions? ${p.supportEmail}` : "",
  ].join("\n");

  return { subject: `Your ${p.productName} demo for ${p.businessName} is ready`, html, text };
}
