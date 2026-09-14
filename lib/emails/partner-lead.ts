/**
 * Internal notification email for new Post Partner leads
 * (app/actions/partners.ts's submitPartnerLead), sent to Alex instead of a
 * Slack ping via n8n — same call already made for Expert & Community
 * Spotlight submissions on the main site (site/lib/emails/spotlight-
 * submission.ts): partner leads are low-volume and reviewed by Alex
 * personally, so a direct email is simpler than standing up an n8n
 * workflow, and email is the more natural place for an inbound-interest
 * message to land than Slack. Uses replyTo so Alex can just hit reply to
 * respond to the business directly.
 *
 * Doesn't use baseEmail()/emailFooter() — those bake in member-facing
 * copy ("you're receiving this because you subscribed", a "Manage
 * subscription" link) that would be confusing on an internal ops email.
 * wrapEmail() below is a minimal local equivalent, built from the same
 * emailHead()/bodySection() primitives, mirroring spotlight-submission.ts's
 * own wrapEmail().
 */

import { FROM, getResend, bodySection, emailHead, subjectPrefix } from "./base";

export type PartnerLeadEmailPayload = {
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  note: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapEmail(content: string): string {
  return `<!DOCTYPE html>
<html>
${emailHead()}
<body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0">
<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5">
  <tbody><tr><td style="background-color:#f0f1f5">
    <table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation"
      style="max-width:600px;margin:0 auto;background-color:#ffffff;width:600px;min-width:600px">
      <tbody>
        <tr><td style="padding:24px 0;vertical-align:top">
          <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
            style="color:#000;font-size:16px;line-height:1.4;text-align:left;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse">
            <tbody>
              ${content}
              <tr><td style="font-size:13px;color:#8A9E3A;text-align:center;padding:24px 24px 0">
                Sent from the /partners lead form on postpartumpost.com
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

function partnerLeadHtml(payload: PartnerLeadEmailPayload): string {
  const name = `${payload.firstName} ${payload.lastName}`.trim();

  const intro = bodySection(`
    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4">
      <span style="font-weight:700">Post Partner submission from: ${escapeHtml(payload.businessName)}</span>
    </td></tr>
    <tr><td dir="ltr" style="font-size:14px;text-align:left;padding:0 0 4px;line-height:1.4">
      <b>Contact:</b> ${escapeHtml(name)}
    </td></tr>
    <tr><td dir="ltr" style="font-size:14px;text-align:left;line-height:1.4">
      <b>Reply-to:</b> ${escapeHtml(payload.email)}
    </td></tr>
  `);

  const noteSection = bodySection(`
    <tr><td dir="ltr" style="font-size:18px;font-weight:700;text-align:left;padding:0 0 8px;line-height:1.4">Their perk idea</td></tr>
    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;white-space:pre-wrap">${escapeHtml(payload.note)}</td></tr>
  `);

  return wrapEmail(intro + noteSection);
}

export async function sendPartnerLeadEmail(payload: PartnerLeadEmailPayload): Promise<void> {
  const resend = getResend();
  const to = process.env.PARTNER_LEAD_EMAIL || "post@amsterdamparentproject.nl";

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    replyTo: payload.email,
    subject: `${subjectPrefix()}New Post Partner submission: ${payload.businessName}`,
    html: partnerLeadHtml(payload),
  });

  if (error) {
    console.error("[resend] sendPartnerLeadEmail error:", error);
    throw error;
  }
}
