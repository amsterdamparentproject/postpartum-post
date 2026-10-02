import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function rematchConfirmationHtml(firstName: string, credited: boolean): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Thanks for letting us know — we've received your report and ended this month's match.${credited ? " We've added one match back to your balance, so you won't lose a match to this." : ""}
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You can still use your Post Perks this month, and you'll be matched again in the next round.
                                    </td></tr>`) +
    ctaButton("Go to your matches", `${SITE_URL}/matches`);

  return baseEmail(content);
}

export async function sendRematchConfirmationEmail(email: string, firstName: string, credited = false) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}We've received your report`,
    html: rematchConfirmationHtml(firstName, credited),
  });
  if (error) {
    console.error("[resend] sendRematchConfirmationEmail error:", error);
    throw error;
  }
}
