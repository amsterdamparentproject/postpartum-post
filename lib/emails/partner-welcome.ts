/**
 * Sent when a lead becomes a real partner (convertLeadToPartner,
 * app/admin/partners/actions.ts) — never for a partner Alex adds directly
 * outside the lead flow (addPartner in that same file), since those often
 * have no email yet (e.g. a Circle of Experts contributor) and aren't
 * ready to be told to sign in.
 *
 * Doesn't use base.ts's baseEmail()/emailFooter() — that footer bakes in
 * member-facing copy ("you're receiving this because you subscribed", a
 * "Manage subscription" link) that would be confusing to a business
 * partner. Same call partner-lead.ts already makes for its own internal
 * notification; this one reuses emailHeader() too, since — unlike that
 * internal ops email — it's partner-facing and should look like the rest
 * of the site's outbound mail.
 *
 * `portalUrl` is a signed magic link (generateMagicLinkWithRetry, built by
 * the caller), not a plain /partners/login URL — same pattern
 * app/api/send-match-emails/route.ts uses for member emails, so clicking
 * "Go to your portal" signs the partner straight into /partners/profile
 * instead of making them request a second link. The caller falls back to a
 * plain /partners/login URL if link generation fails, so this always
 * receives a usable URL either way.
 */

import { FROM, getResend, bodySection, ctaButton, emailHead, emailHeader, subjectPrefix } from "./base";

export type PartnerWelcomeEmailPayload = {
  firstName: string;
  businessName: string;
  email: string;
  portalUrl: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapEmail(content: string): string {
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

function partnerWelcomeHtml(payload: PartnerWelcomeEmailPayload): string {
  const intro = bodySection(
    `
    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4">
      <span style="font-weight:700">Welcome, ${escapeHtml(payload.firstName)}!</span>
      <span> ${escapeHtml(payload.businessName)} is officially a Post Perks partner. We're grateful and excited to have you on board!</span>
    </td></tr>
    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4">
      You can sign in any time with this email address to add your business details, locations, and perks for Postpartum Post members to discover.
    </td></tr>
    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4">
      Perks you add are reviewed before they go live, so add as many as you'd like — we'll follow up once they're approved.
    </td></tr>
  `,
    true // tightBottom — the CTA button right below already carries its own spacing
  );

  return wrapEmail(emailHeader() + intro + ctaButton("Go to your portal", payload.portalUrl));
}

export async function sendPartnerWelcomeEmail(payload: PartnerWelcomeEmailPayload): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: payload.email,
    replyTo: "post@amsterdamparentproject.nl",
    subject: `${subjectPrefix()}Welcome to Post Perks, ${payload.businessName}! 🎉`,
    html: partnerWelcomeHtml(payload),
  });
  if (error) {
    console.error("[resend] sendPartnerWelcomeEmail error:", error);
    throw error;
  }
}
