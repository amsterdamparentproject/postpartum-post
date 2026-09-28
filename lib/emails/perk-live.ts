/**
 * Sent to a partner when one of their perks goes live: its status changes
 * to 'published' from anything else (setPerkStatus / updatePerkAdmin /
 * addPerkForPartner in app/admin/partners/actions.ts, via notifyPerkLive).
 * Closes the loop partner-welcome.ts opens ("we'll follow up once they're
 * approved"). 'coming_soon' doesn't trigger it, since that perk isn't live yet.
 *
 * The CTA points at the public /perks page, where published perks show up,
 * rather than the partner portal: the point of this email is "go see it."
 * The portal is mentioned in the copy for edits.
 */

import { FROM, SITE_URL, getResend, bodySection, ctaButton, emailHeader, subjectPrefix } from "./base";
import { escapeHtml, wrapPartnerEmail } from "./partner-base";

export type PerkLiveEmailPayload = {
  firstName: string | null;
  businessName: string;
  email: string;
  perkTitle: string;
};

function perkLiveHtml(payload: PerkLiveEmailPayload): string {
  const greeting = payload.firstName ? `Hi, ${escapeHtml(payload.firstName)}!` : "Good news!";
  const intro = bodySection(
    `
    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4">
      <span style="font-weight:700">${greeting}</span>
      <span> Your perk <span style="font-weight:700">${escapeHtml(payload.perkTitle)}</span> has been approved and is now live on Post Perks. ✨</span>
    </td></tr>
    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4">
      Postpartum Post members can now discover ${escapeHtml(payload.businessName)} — and perhaps bring their match along for a visit.
    </td></tr>
    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4">
      Want to change it or add another? Just <a href="${SITE_URL}/partners/login" style="color:#000">sign in to your partner portal</a>. Any edits get a quick review from us before they go live again.
    </td></tr>
  `,
    true // tightBottom — the CTA button right below already carries its own spacing
  );

  return wrapPartnerEmail(emailHeader() + intro + ctaButton("See it on Post Perks", `${SITE_URL}/perks`));
}

export async function sendPerkLiveEmail(payload: PerkLiveEmailPayload): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: payload.email,
    replyTo: "post@amsterdamparentproject.nl",
    subject: `${subjectPrefix()}Your perk is live! ✨`,
    html: perkLiveHtml(payload),
  });
  if (error) {
    console.error("[resend] sendPerkLiveEmail error:", error);
    throw error;
  }
}
