import { FROM, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function optinHtml(
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  skipUrl: string
): string {
  const content = emailHeader() + bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      It's the start of the month, which means that it's time to connect with a new parent nearby! Let us know how you'd like to meet this month — we'll take care of the rest.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You have until the <span style="font-weight:700">5th of the month</span> to respond. You'll receive your introduction on the 7th 💌
                                    </td></tr>`) +
    ctaButton("☕ Meet for coffee", coffeeUrl) +
    ctaButton("🛝 Meet for a playdate", playdateUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:13px;text-align:center;color:#666666;line-height:1.4;mso-line-height-alt:18.2px">
                                      Need a break? <a href="${skipUrl}" style="color:#666666;text-decoration:underline">Skip this month</a> and your subscription will be extended automatically, for free. If we don't hear from you, we'll assume you don't want to be matched but your subscription will continue.
                                    </td></tr>`);

  return baseEmail(content);
}

export async function sendOptinEmail(
  email: string,
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  skipUrl: string
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Postpartum Post: Let's meet this month! 💌`,
    html: optinHtml(firstName, coffeeUrl, playdateUrl, skipUrl),
  });
  if (error) {
    console.error("[resend] sendOptinEmail error:", error);
    throw error;
  }
}
