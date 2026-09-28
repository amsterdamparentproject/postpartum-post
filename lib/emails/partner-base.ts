/**
 * Shared shell for partner-facing emails (partner-welcome.ts, perk-live.ts).
 *
 * Doesn't use base.ts's baseEmail()/emailFooter() — that footer bakes in
 * member-facing copy ("you're receiving this because you subscribed", a
 * "Manage subscription" link) that would be confusing to a business
 * partner. Same call partner-lead.ts already makes for its own internal
 * notification; partner-facing emails still reuse emailHeader() so they
 * look like the rest of the site's outbound mail.
 */

import { emailHead } from "./base";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapPartnerEmail(content: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
${emailHead()}
<body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0">
<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5">
  <tbody><tr><td style="background-color:#f0f1f5">
    <table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation"
      style="max-width:600px;margin:0 auto;background-color:#ffffff;width:600px;min-width:600px">
      <tbody>
        <tr><td style="padding:0 0 24px;vertical-align:top">
          <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
            style="color:#000;font-size:16px;line-height:1.4;text-align:left;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse">
            <tbody>
              ${content}
              <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 48px 8px;line-height:1.4">
                Happy connecting,
              </td></tr>
              <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 48px 24px;line-height:1.4">
                Alex from Amsterdam Parent Project
              </td></tr>
              <tr><td dir="ltr" style="font-size:13px;color:#8A9E3A;text-align:center;padding:0 24px 24px;line-height:1.4">
                Questions? Just reply to this email, or reach us at
                <a href="mailto:post@amsterdamparentproject.nl" style="color:#8A9E3A">post@amsterdamparentproject.nl</a>.
              </td></tr>
            </tbody>
          </table>
        </td></tr>
      </tbody>
    </table>
  </td></tr></tbody>
</table>
</body>
</html>`;
}
