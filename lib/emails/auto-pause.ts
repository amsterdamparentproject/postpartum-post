import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";

function autoPauseHtml(firstName: string): string {
  const content =
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You've skipped the last three months in a row, so I've automatically paused your subscription — no more charges until you're ready to come back.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Life with a little one is unpredictable, and there's no pressure here. When things settle down and you'd like to start receiving matches again, just log in to billing and resume whenever you're ready.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      Or simply reply to this email and I'll help you sort it out personally.
                                    </td></tr>`) +
    ctaButton("Manage billing →", `${SITE_URL}/billing`);
  return baseEmail(content);
}

export async function sendAutoPauseEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your Postpartum Post subscription has been paused`,
    html: autoPauseHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendAutoPauseEmail error:", error);
    throw error;
  }
}
