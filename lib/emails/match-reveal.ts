import { FROM, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function matchRevealHtml(
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchEmail: string,
  topic: string | null,
  matchPageUrl: string,
  matchesLink: string,
  isDoubleMatch: boolean,
  isRecipientInitiator: boolean,
): string {
  const mailtoSubject = encodeURIComponent(`Let's meet for a ${topic || "hang"}! (Postpartum Post)`);
  const mailtoBody = encodeURIComponent(`Hi ${matchFirstName},`);

  const initiatorLine = isRecipientInitiator
    ? `Get started: To skip all that first-contact awkwardness, <b>we select 1 person from the match to initiate the conversation — and it's you!</b> You can reply directly to this email, or use the button below. Reach out to ${matchFirstName} in the next day or so; they'll be waiting ☺️`
    : `<b>Get started:</b> We've nudged ${matchFirstName} to start the conversation this month. Keep an eye on your inbox over the next day or two — or say hi now if you're eager to get started ☺️ You can reply directly to this email, or use the button below.`;

  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${recipientFirstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hurrah, your Post has arrived! 🎉📬 Your match for this month is <span style="font-weight:700">${matchFirstName} ${matchLastName}</span>, another parent in Amsterdam who is excited to connect. Check out your match page for some local activities and resources to inspire your meetup. Enjoy your ${topic || "hang"}! 
                                    </td></tr>`, true) +
    ctaButton("See your match page", matchPageUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      ${initiatorLine}
                                    </td></tr>`, true) +
    ctaButton(`Email ${matchFirstName} now`, `mailto:${matchEmail}?subject=${mailtoSubject}&body=${mailtoBody}`) +
    bodySection(`                 
                                    <tr><td dir="ltr" style="font-size:14px;color:#666666;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:19.6px">
                                      Please make sure to review our <a href="https://postpartumpost.com/community-guidelines" style="color:#000000;text-decoration:underline;">Community Guidelines</a> before interacting with your match — to keep things safe and joyful for all. If this match isn&apos;t working out, you can request a rematch from your <a href="${matchesLink}" style="color:#000000;text-decoration:underline;">matches page</a> before the 14th of the month.
                                    </td></tr>
                                    ${isDoubleMatch ? `<tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:22.4px">
                                      A quick note: Due to your profile preferences and our odd-numbered parent pool this month, we matched you twice! We hope you enjoy your extra connection ❤️ If you don't want 2 matches next month, make sure to change the setting in your profile.
                                    </td></tr>` : ""}`);
  return baseEmail(content);
}

export async function sendMatchRevealEmail(
  recipientEmail: string,
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchEmail: string,
  topic: string | null,
  matchPageUrl: string,
  matchesLink: string,
  isDoubleMatch = false,
  isRecipientInitiator = false,
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    // Invisible fallback: if the recipient just hits "Reply" instead of using
    // the "Email {name} now" button, it still lands with their match — not us.
    replyTo: matchEmail,
    subject: `${subjectPrefix()}Your Postpartum Post match for ${new Date().toLocaleString("en-US", { month: "long" })} is here 💌`,
    html: matchRevealHtml(
      recipientFirstName,
      matchFirstName,
      matchLastName,
      matchEmail,
      topic,
      matchPageUrl,
      matchesLink,
      isDoubleMatch,
      isRecipientInitiator,
    ),
  });
  if (error) {
    console.error("[resend] sendMatchRevealEmail error:", error);
    throw error;
  }
}
