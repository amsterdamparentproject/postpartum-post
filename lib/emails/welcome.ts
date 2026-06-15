import { FROM, ASSETS_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";

function welcomeHtml(firstName: string, profileLink: string, planLabel: string, nextBillingDate: string): string {
  const headerImage = `
                  <!-- Header image -->
                  <tr><td style="padding:0 24px 16px">
                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                      <td align="center">
                        <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="552" style="width:552px"><tbody><tr><td><![endif]-->
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:552px"><tbody><tr>
                          <td style="width:100%">
                            <img src="${ASSETS_URL}/email-images/welcome.png" width="552" height="625"
                              alt="Welcome to Postpartum Post"
                              style="display:block;width:100%;height:auto;max-width:100%">
                          </td>
                        </tr></tbody></table>
                        <!--[if mso]></td></tr></tbody></table><![endif]-->
                      </td>
                    </tr></tbody></table>
                  </td></tr>`;

  const welcomeCopy = bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Welcome, ${firstName}!</span>
                                      <span> We're really excited to have you in the community.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>You're subscribed to the </span><span style="font-weight:700">${planLabel}</span><span> plan. Your first billing date is </span><span style="font-weight:700">${nextBillingDate}</span><span>. You can manage or cancel your subscription any time from your billing page.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>Each month, we'll introduce you to another new or expecting parent nearby. Think of it as a</span>
                                      <span style="font-weight:700"> friendship starter pack</span><span>: you'll both have each others' names, contact, and a list of fun activities to do by yourselves or together with your families.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      In order to find the best matches for you, we've put together a profile. If you haven't already, fill out as much — or as little — as you want; we'll find you a match with whatever information we have.
                                    </td></tr>`);

  const schedule = bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Here's what to expect from us each month:
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-align:left;padding:0 0 16px;line-height:1.43;mso-line-height-alt:22.9px">
                                      <span style="text-decoration:underline">1st to 5th of the month:</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.43;mso-line-height-alt:22.9px">
                                      <span style="font-weight:700">Opt into matching</span>
                                      <span> by choosing a topic. You can always skip a month at no charge and get your subscription extended automatically.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-decoration:underline;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      7th of the month:
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Receive your match</span>
                                      <span>! Your introduction, accompanied by a whimsical piece of art from our community.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="text-decoration:underline">Before the 14th of the month:</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Request a rematch</span>
                                      <span> if it's not working out</span>
                                    </td></tr>`);

  return baseEmail(
    headerImage + welcomeCopy + ctaButton("Go to your profile", profileLink) + schedule,
    `<link rel="preload" as="image" href="${ASSETS_URL}/email-images/welcome.png">`
  );
}

export async function sendWelcomeEmail(
  email: string,
  firstName: string,
  profileLink: string,
  planLabel: string,
  nextBillingDate: string,
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Welcome to Postpartum Post 💌`,
    html: welcomeHtml(firstName, profileLink, planLabel, nextBillingDate),
  });
  if (error) {
    console.error("[resend] sendWelcomeEmail error:", error);
    throw error;
  }
}
