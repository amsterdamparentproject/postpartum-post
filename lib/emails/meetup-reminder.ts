import { FROM, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function meetupReminderHtml(
  recipientFirstName: string,
  matchFirstName: string,
  matchEmail: string,
  feedbackUrl: string,
): string {
  const mailtoSubject = encodeURIComponent("Let's find a time to meet up! (Postpartum Post)");
  const mailtoBody = encodeURIComponent(`Hi ${matchFirstName},`);

  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${recipientFirstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Quick note from the Post — you've got <span style="font-weight:700">one week left this month</span> to meet up with ${matchFirstName}! If you haven't picked a day yet, now's a great time.
                                    </td></tr>`, true) +
    ctaButton(`Email ${matchFirstName} now`, `mailto:${matchEmail}?subject=${mailtoSubject}&body=${mailtoBody}`) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you've already met with your match, we'd love to hear how it went! Your perspective is incredibly valuable to help prioritize the features that make the Post as useful as possible to make deep connections with local parents ❤️
                                    </td></tr>`, true) +
    ctaButton("Tell us how it went", feedbackUrl) +
    `<tr><td style="padding:0 0 24px;font-size:0;line-height:0" aria-hidden="true">&nbsp;</td></tr>`;

  return baseEmail(content);
}

export async function sendMeetupReminderEmail(
  recipientEmail: string,
  recipientFirstName: string,
  matchFirstName: string,
  matchEmail: string,
  feedbackUrl: string,
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    replyTo: matchEmail,
    subject: `${subjectPrefix()}Postpartum Post: One week left to meet up! ⏰`,
    html: meetupReminderHtml(recipientFirstName, matchFirstName, matchEmail, feedbackUrl),
  });
  if (error) {
    console.error("[resend] sendMeetupReminderEmail error:", error);
    throw error;
  }
}
