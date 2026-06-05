import { FROM, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";

function matchRevealHtml(
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchType: string | null,
  matchPageUrl: string,
  matchesLink: string,
): string {
  const meetingContext = matchType === "in_person"
    ? "meeting up in person"
    : matchType === "online"
    ? "connecting online"
    : "connecting";

  const content =
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${recipientFirstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your Post has arrived 📬 Your match for this month is <span style="font-weight:700">${matchFirstName} ${matchLastName}</span>, another parent in Amsterdam who is eager to connect.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your match page has both of your contact details, plus some local activities and resources to inspire your meetup. Enjoy your ${meetingContext}!
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      The link below is shared just between you and ${matchFirstName} — unique to you both, no login needed.
                                    </td></tr>`) +
    ctaButton("See your match page", matchPageUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:14px;color:#666666;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:19.6px">
                                      Please make sure to review our <a href="https://postpartumpost.com/community-guidelines" style="color:#000000;text-decoration:underline;">Community Guidelines</a> before interacting with your match — to keep things safe and joyful for all. If this match isn&apos;t working out, you can request a rematch from your <a href="${matchesLink}" style="color:#000000;text-decoration:underline;">matches page</a> before the 14th of the month.
                                    </td></tr>`);
  return baseEmail(content);
}

export async function sendMatchRevealEmail(
  recipientEmail: string,
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchType: string | null,
  matchPageUrl: string,
  matchesLink: string,
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    subject: `${subjectPrefix()}Your Postpartum Post match for ${new Date().toLocaleString("en-US", { month: "long" })} is here 💌`,
    html: matchRevealHtml(
      recipientFirstName,
      matchFirstName,
      matchLastName,
      matchType,
      matchPageUrl,
      matchesLink,
    ),
  });
  if (error) {
    console.error("[resend] sendMatchRevealEmail error:", error);
    throw error;
  }
}
