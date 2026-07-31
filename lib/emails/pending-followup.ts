import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function pendingFollowupHtml(firstName: string, signupUrl: string): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      I was prepping everything for our second Postpartum Post match round tomorrow and noticed that your membership was in a "pending" state, meaning that your subscription signup didn't actually complete.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you'd still like to join us (along with 25 others!) to meet a new parent this month, just <b>finish signing up before tomorrow and you'll be included in August's round</b>. Hope to see you there ❤️
                                    </td></tr>`) +
    ctaButton("Finish signing up", signupUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you've changed your mind, no need to do anything — just wanted to make sure you didn't miss out by accident!
                                    </td></tr>`);

  return baseEmail(content);
}

export async function sendPendingFollowupEmail(
  email: string,
  firstName: string,
  lastName: string,
  prefillEmail = email
) {
  const signupUrl =
    `${SITE_URL}/signup?email=${encodeURIComponent(prefillEmail)}` +
    `&firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`;

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your action needed to join our August match tomorrow 💌`,
    html: pendingFollowupHtml(firstName, signupUrl),
  });
  if (error) {
    console.error("[resend] sendPendingFollowupEmail error:", error);
    throw error;
  }
}
