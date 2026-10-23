import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix, emailHeader, escapeHtml } from "./base";
import { generateConsentToken } from "@/lib/tokens";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;

/**
 * Welcome email for a member an admin comped (lib/comp-member.ts). They never
 * saw a billing screen and may not have signed up themselves, so it says the
 * round is a gift and how the 1st to 5th opt-in window works. An optional note
 * from the admin replaces the "Welcome!" opening. The button is also their
 * consent: the small print under it says clicking means they agree to the
 * Community Guidelines and are eligible, and the link (consentEntryLink) records
 * that and signs them in to their profile. When the gift includes Post Perks, a
 * closing paragraph explains them.
 */

/** The button's link: records consent, then signs the member in. See app/api/consent/enter/route.ts. */
export function consentEntryLink(memberId: string): string {
  return `${SITE_URL}/api/consent/enter?member_id=${memberId}&token=${generateConsentToken(memberId)}`;
}

// Sits in the same bodySection as the Perks paragraph (see below): two sections
// would stack their 26px paddings and leave a big gap between the two.
const finePrint = (gapBelow: boolean) => `
                                    <tr><td dir="ltr" style="font-size:13px;text-align:center;padding:0 0 ${gapBelow ? 16 : 0}px;line-height:1.4;mso-line-height-alt:18px;color:#555555">
                                      <span>By clicking, you agree to our </span><a href="${SITE_URL}/community-guidelines" style="color:#555555;text-decoration:underline">Community Guidelines</a><span> and confirm you're a parent (or expecting a child) and 18 or older.</span>
                                    </td></tr>`;

export function giftedWelcomeHtml(entryLink: string, includePerks: boolean, note?: string | null): string {
  // An admin's note ("Congrats, Holly — you won our Post Perks giveaway!") replaces the plain "Welcome!".
  const opening = escapeHtml(note?.trim() || "Welcome!");
  const rows = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">${opening}</span>
                                      <span> You've been gifted a free round to Postpartum Post. We're really excited to have you in the community ❤️</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>Every month is 1 round: a hand-picked match with another new or expecting parent nearby, delivered via email. Think of it as a </span><span style="font-weight:700">friendship starter pack</span><span>: you'll both have each others' names, contact, and a list of fun activities to do by yourselves or together with your families.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">What's next:</span>
                                      <span> Opt in between the 1st and the 5th of the month to get your match — either via email or the website. Your match arrives on the 7th. In the meantime, fill out your profile so we can find you a good match. Share as much or as little as you like.</span>
                                    </td></tr>`;

  const perksRows = `
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>Your free round also comes with </span><a href="${SITE_URL}/perks" style="color:#000000;font-weight:700;text-decoration:underline">Post Perks</a><span>: discounts and freebies from local family-friendly businesses. To make meetups all the sweeter — or to treat yourself. You can use Perks right away (which will use your free match) or wait until next month to get them alongside a match.</span>
                                    </td></tr>`;

  return baseEmail(
    emailHeader() + bodySection(rows) + ctaButton("Go to your profile", entryLink) + bodySection(finePrint(includePerks) + (includePerks ? perksRows : ""))
  );
}

export async function sendGiftedWelcomeEmail(email: string, entryLink: string, includePerks: boolean, note?: string | null) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}You've been gifted a free round of Postpartum Post 💌`,
    html: giftedWelcomeHtml(entryLink, includePerks, note),
  });
  if (error) {
    console.error("[resend] sendGiftedWelcomeEmail error:", error);
    throw error;
  }
}
