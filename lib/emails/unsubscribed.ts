import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";
import { feedbackMagicLink } from "@/lib/feedback-link";
import { createAdminClient } from "@/lib/supabase";

function unsubscribedHtml(firstName: string, feedbackUrl: string): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your Postpartum Post access has now ended, as you have canceled your subscription and have no more matches left. No further charges will be made to your account.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      On a personal note, I'm sorry to see you leave our match community! I hope Postpartum Post brought you at least one meaningful connection with a local parent — that's at the heart of it all ❤️
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Any feedback you're willing to share about your experience would be greatly appreciated, so we can keep helping neighborhood parents find each other. You can leave feedback <a href="${feedbackUrl}" style="color:#000000;text-decoration:underline;">here</a>.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you'd like to come back, you're always welcome! You can pick up where you left off by resubscribing below:
                                    </td></tr>`) +
    ctaButton("Go to postpartumpost.com →", SITE_URL);
  return baseEmail(content, "", { signoff: "All the best," });
}

export async function sendUnsubscribedEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  firstName: string
) {
  const feedbackUrl = await feedbackMagicLink(supabase, email);
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}You've unsubscribed from Postpartum Post`,
    html: unsubscribedHtml(firstName, feedbackUrl),
  });
  if (error) {
    console.error("[resend] sendUnsubscribedEmail error:", error);
    throw error;
  }
}
