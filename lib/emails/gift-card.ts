import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function giftCardHtml(code: string, giftMonths: number): string {
  const roundsText = giftMonths === 1 ? "1 round" : `${giftMonths} rounds`;
  // After the gifted rounds run out the member is billed the plan price again.
  const afterGift = giftMonths === 1 ? "€12 for 1 round" : "€24 for 3 rounds";

  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi there!
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You've been gifted <span style="font-weight:700">${roundsText} of Postpartum Post</span>: a hand-picked match and Post Perks from local family-friendly businesses each round, on us.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your gift card code is:
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:24px;font-weight:700;text-align:center;padding:16px 0;letter-spacing:0.08em;line-height:1.2;mso-line-height-alt:28.8px">
                                      ${code}
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Click the button below to create your account — your code will be applied automatically at checkout. Enjoy ${roundsText} free. After that, your membership renews at ${afterGift} unless you cancel, anytime.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      This code can only be used once, so keep it safe!
                                    </td></tr>`) +
    ctaButton("Claim your gift →", `${SITE_URL}/redeem?code=${code}`);

  return baseEmail(content);
}

export async function sendGiftCardEmail(email: string, code: string, giftMonths: number) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your Postpartum Post Gift Card 🎁`,
    html: giftCardHtml(code, giftMonths),
  });
  if (error) {
    console.error("[resend] sendGiftCardEmail error:", error);
    throw error;
  }
}
