import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function unsubscribedHtml(firstName: string): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your Postpartum Post subscription has been canceled. No more charges will be made, and your current period runs until the end of the billing cycle.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      I'm sorry to see you go. I hope Postpartum Post brought you at least one meaningful connection — that was always the goal.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you'd like to come back, you're always welcome. Whenever the timing is right, you can resubscribe below.
                                    </td></tr>`) +
    ctaButton("Visit postpartumpost.com →", SITE_URL);
  return baseEmail(content);
}

export async function sendUnsubscribedEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}You've unsubscribed from Postpartum Post`,
    html: unsubscribedHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendUnsubscribedEmail error:", error);
    throw error;
  }
}
