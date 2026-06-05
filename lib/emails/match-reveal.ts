import { FROM, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function matchRevealHtml(
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  topic: string | null,
  matchPageUrl: string,
  matchesLink: string,
  isDoubleMatch: boolean,
): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${recipientFirstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hurrah, your Post has arrived! 🎉📬 Your match for this month is <span style="font-weight:700">${matchFirstName} ${matchLastName}</span>, another parent in Amsterdam who is excited to connect.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your match page has both of your contact details, plus some local activities and resources to inspire your meetup. Enjoy your ${topic || "hang"}!
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      The link below is shared just between you and ${matchFirstName} — unique to you both, no login needed.
                                    </td></tr>`) +
    ctaButton("See your match page", matchPageUrl) +
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
  topic: string | null,
  matchPageUrl: string,
  matchesLink: string,
  isDoubleMatch = false,
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
      topic,
      matchPageUrl,
      matchesLink,
      isDoubleMatch,
    ),
  });
  if (error) {
    console.error("[resend] sendMatchRevealEmail error:", error);
    throw error;
  }
}
