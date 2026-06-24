import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function rematchConfirmationHtml(firstName: string): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      We've received your rematch request — we're on it! We'll pair you with someone new as soon as we can.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      In the meantime, you can check your matches page to see your current status.
                                    </td></tr>`) +
    ctaButton("Go to your matches", `${SITE_URL}/matches`);

  return baseEmail(content);
}

export async function sendRematchConfirmationEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}We've received your rematch request 🔄`,
    html: rematchConfirmationHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendRematchConfirmationEmail error:", error);
    throw error;
  }
}
