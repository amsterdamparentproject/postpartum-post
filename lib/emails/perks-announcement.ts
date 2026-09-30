/**
 * One-off announcement to existing members, sent the day before the round
 * that introduces Post Perks (2026-10): Post Perks are live, they're part of
 * the membership, and the opt-in email gains a "No meetup, just perks"
 * button. Sent by scripts/send-perks-announcement.mts (never automatically).
 *
 * The "first perks" link goes to the public /perks page rather than
 * /my-perks on purpose: until a member opts in for the month, /my-perks
 * shows the opt-in prompt instead of the perk grid, so a click today would
 * land on no perks. /perks needs no sign-in and lists the live perks.
 */

import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

const P = `dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px"`;
const P_LAST = `dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px"`;
const LINK = `style="color:#000000;text-decoration:underline"`;

function perksAnnouncementHtml(firstName: string): string {
  // UTM-tagged so visits from this email show up separately in Umami.
  const perksUrl = `${SITE_URL}/perks?utm_source=email&utm_campaign=perks-announcement`;
  const feedbackUrl = `${SITE_URL}/feedback`;
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td ${P}>Hi ${firstName},</td></tr>
                                    <tr><td ${P}>
                                      Alex here, creator of Postpartum Post. I have been working a ton behind the scenes on adding even more value to Postpartum Post — and I'm really excited to share this update with y'all ahead of our new match round tomorrow.
                                    </td></tr>
                                    <tr><td ${P}>
                                      🎁 <strong>Post Perks are officially live!</strong> These are discounts from local parent-centric businesses, just for Postpartum Post members — from 50% off to intro offers. Use with your match, or just for yourself & your family.
                                    </td></tr>
`, true) +
    ctaButton("See the first perks 🎁", perksUrl) +
    bodySection(`
                                    <tr><td ${P}>
                                      ✨ <strong>Post Perks are part of your membership.</strong> Every month you opt in, you get access to that month's perks, alongside your match. Your match introduction on the 7th now arrives with perks for both of you.
                                    </td></tr>
                                    <tr><td ${P}>
                                      💌 <strong>Not up for a match this month?</strong> There's now a new way to opt in: "No meetup, just perks." If you're having a busy month or not feeling a meetup, you can still enjoy Post Perks without being matched.
                                    </td></tr>
                                    <tr><td ${P}>
                                      <strong>How it works:</strong>
                                      <ul style="margin:8px 0 0;padding-left:20px">
                                        <li style="padding-bottom:4px">Tomorrow (the 1st) you'll get the usual opt-in email, where you can choose a match + perks or just perks.</li>
                                        <li style="padding-bottom:4px">Each perk can be used once a month. Intro offers can be used once, ever.</li>
                                        <li>Perks run on the honor system. Please keep them to yourself!</li>
                                      </ul>
                                    </td></tr>
                                    <tr><td ${P}>
                                      I'm really excited for this new phase of Postpartum Post, where we get to connect parents not only to each other, but also to the local businesses that support our community here in Amsterdam. A win-win-win (if you also count our wallets 💸) at its finest.
                                    </td></tr>
                                    <tr><td ${P_LAST}>
                                      And as you'll be the first to use Post Perks... Any bug reports or <a href="${feedbackUrl}" ${LINK}>feedback</a> would be very appreciated. Just a solo founder here using tech skills for community good 🫡
                                    </td></tr>`);
  return baseEmail(content);
}

export async function sendPerksAnnouncementEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Heads up: Tomorrow's match round contains gifts 🎁`,
    html: perksAnnouncementHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendPerksAnnouncementEmail error:", error);
    throw error;
  }
}
