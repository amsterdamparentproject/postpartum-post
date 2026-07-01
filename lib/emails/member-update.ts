import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";
import { generateConsentToken } from "@/lib/tokens";

function memberUpdateHtml(firstName: string, confirmUrl: string): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;font-style:italic;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You just received a copy of this email with "TEST:" in the subject line — early Founding Member perks 😆. Both emails are legit, but I'm resending this with the correct subject line so that you know it's real. Thanks for your patience ❤️ Looking forward to tomorrow.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Alex here, the mom behind Postpartum Post and APP. So excited to have you as one of our Founding Members for the Post. We've got a full house, and the <span style="font-weight:700">first match round starts tomorrow!</span> 🎉
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      I've been introducing new features over the last few weeks to ensure that each match feels thoughtful and safe. Here's what's new — including some new profile additions that will improve your match:
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <ul style="margin:0;padding:0 0 0 20px;">
                                        <li style="padding-bottom:12px;"><span style="font-weight:700">Your shared match page.</span> You'll have a map, calendar, and list view of places to go and things to do based on the information you and your match provide. It's meant to provide inspiration — a starting point for making plans, curated just for the two of you.</li>
                                        <li style="padding-bottom:12px;"><span style="font-weight:700">Match management.</span> You'll be able to email your match directly, request a rematch (until the 14th of the month), or add someone to your do-not-match list, all from your matches hub. The do-not-match list is especially handy if you've signed up with your partner or good friend ❤️</li>
                                        <li><span style="font-weight:700">Community Guidelines.</span> I've published our <a href="${SITE_URL}/community-guidelines" style="color:#000000;text-decoration:underline;">Community Guidelines</a> — a guide for how Postpartum Post works and what we expect from members. Please take a moment to read them. Safety and community are at the heart of this, and it's important that we are all on the same page. (You're welcome for the pun 😆)</li>
                                      </ul>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Finally: Please formally confirm your account so that I know you've read the guidelines and are a parent — or expecting — who is 18+. (I recently added signup confirmation controls for all new members 🙏🏻)
                                    </td></tr>`) +
    ctaButton("Confirm my account", confirmUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:13px;text-align:center;color:#666666;line-height:1.4;mso-line-height-alt:18.2px">
                                      By clicking, you confirm you are 18 or older, a parent or expecting a child, and that you agree to our <a href="${SITE_URL}/community-guidelines" style="color:#666666;text-decoration:underline;">Community Guidelines</a>.
                                    </td></tr>`);

  return baseEmail(content);
}

export async function sendMemberUpdateEmail(
  email: string,
  firstName: string,
  memberId: string
) {
  const token = generateConsentToken(memberId);
  const confirmUrl = `${SITE_URL}/api/consent/confirm?member_id=${memberId}&token=${token}`;

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Postpartum Post: First matches tomorrow! 💌`,
    html: memberUpdateHtml(firstName, confirmUrl),
  });
  if (error) {
    console.error("[resend] sendMemberUpdateEmail error:", error);
    throw error;
  }
}
