import { FROM, SITE_URL, ASSETS_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;

/**
 * Welcome email for comped cohort members (Dutch for Parents). They never
 * saw a billing screen, so the closing note says the match is a gift from
 * their course, nothing is charged, and nothing renews. The 1st to 5th
 * opt-in window is explained above the button.
 */
export function cohortWelcomeHtml(firstName: string, signInLink: string, cohortName: string): string {
  // Double-branded header: Dutch Speaking Academy & Postpartum Post.
  const headerImage = `
                  <tr><td style="padding:0 24px 16px">
                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                      <td align="center">
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:552px"><tbody><tr>
                          <td style="width:100%">
                            <img src="${ASSETS_URL}/email-images/welcome-dsa.png" width="552" height="184"
                              alt="Dutch Speaking Academy and Postpartum Post"
                              style="display:block;width:100%;height:auto;max-width:100%">
                          </td>
                        </tr></tbody></table>
                      </td>
                    </tr></tbody></table>
                  </td></tr>`;

  const rows = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">Welcome, ${firstName}!</span>
                                      <span> You're in, and your free match from ${cohortName} is waiting.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>Every round starts with a hand-picked introduction, delivered like a joyful little letter to your email. Your match will be another parent from ${cohortName} to practice real Dutch with, in person if you live nearby or on a video call if you don't.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">What's next:</span>
                                      <span> Make sure to opt in between the 1st and the 5th of the month to get your match. We'll email you when the window opens, and your match arrives on the 7th.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>In the meantime, you can fill out your <a href="${SITE_URL}/profile" style="color:#666666;text-decoration:underline">profile</a> so we can find you a good match. Share as much or as little as you like.</span>
                                    </td></tr>`;

  const afterRows = `
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>Your match is a gift from your course — no charge, and nothing renews on its own. If you want to continue practicing Dutch and/or meeting new parents afterwards, keep an eye on your inbox after the next round has finished!</span>
                                    </td></tr>`;

  return baseEmail(
    headerImage + bodySection(rows) + ctaButton("Go to my profile", signInLink) + bodySection(afterRows),
    `<link rel="preload" as="image" href="${ASSETS_URL}/email-images/welcome-dsa.png">`
  );
}

export async function sendCohortWelcomeEmail(
  email: string,
  firstName: string,
  signInLink: string,
  cohortName: string
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your free match is ready 💌`,
    html: cohortWelcomeHtml(firstName, signInLink, cohortName),
  });
  if (error) {
    console.error("[resend] sendCohortWelcomeEmail error:", error);
    throw error;
  }
}
