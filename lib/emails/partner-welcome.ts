/**
 * Sent when a lead becomes a real partner (convertLeadToPartner,
 * app/admin/partners/actions.ts) — never for a partner Alex adds directly
 * outside the lead flow (addPartner in that same file), since those often
 * have no email yet (e.g. a Circle of Experts contributor) and aren't
 * ready to be told to sign in.
 *
 * Wrapped in partner-base.ts's wrapPartnerEmail() rather than base.ts's
 * baseEmail() — see that file for why partners get their own shell.
 *
 * `portalUrl` is a signed magic link (generateMagicLinkWithRetry, built by
 * the caller), not a plain /partners/login URL — same pattern
 * app/api/send-match-emails/route.ts uses for member emails, so clicking
 * "Go to your portal" signs the partner straight into /partners/profile
 * instead of making them request a second link. The caller falls back to a
 * plain /partners/login URL if link generation fails, so this always
 * receives a usable URL either way.
 */

import { FROM, getResend, bodySection, ctaButton, emailHeader, subjectPrefix } from "./base";
import { escapeHtml, wrapPartnerEmail } from "./partner-base";

export type PartnerWelcomeEmailPayload = {
  firstName: string;
  businessName: string;
  email: string;
  portalUrl: string;
};

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

  return wrapPartnerEmail(emailHeader() + intro + ctaButton("Go to your portal", payload.portalUrl));
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
