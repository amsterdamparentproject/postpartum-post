import { FROM, SITE_URL, ASSETS_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";
import { isOptinWindowOpen } from "@/lib/optin-window";

/**
 * signInLink is a signed link to the primary action: /matches before the 5th
 * (opt into this round), /my-perks after (opt into Perks). The after-the-5th
 * profile link is a plain inline link; the member just saw their profile at checkout.
 */
export function welcomeHtml(firstName: string, signInLink: string, planLabel: string, windowOpen: boolean): string {
  const headerImage = `
                  <!-- Header image -->
                  <tr><td style="padding:0 24px 16px">
                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                      <td align="center">
                        <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="552" style="width:552px"><tbody><tr><td><![endif]-->
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:386px"><tbody><tr>
                          <td style="width:100%">
                            <img src="${ASSETS_URL}/email-images/welcome.png" width="386" height="438"
                              alt="Welcome to Postpartum Post"
                              style="display:block;width:100%;height:auto;max-width:100%">
                          </td>
                        </tr></tbody></table>
                        <!--[if mso]></td></tr></tbody></table><![endif]-->
                      </td>
                    </tr></tbody></table>
                  </td></tr>`;

  const welcomeRows = (`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Welcome, ${firstName}!</span>
                                      <span> We're really excited to have you in the community.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>You're on the </span><span style="font-weight:700">${planLabel}</span><span> plan. We'll charge you again only when your rounds run out, and we'll flag it in your monthly email first. You can manage or cancel your membership any time from your billing page.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>Every month is a round: a hand-picked match with another new or expecting parent nearby, plus </span><span style="font-weight:700">Post Perks</span><span> from local family-friendly businesses. Think of it as a</span>
                                      <span style="font-weight:700"> friendship starter pack</span><span>: you'll both have each others' names, contact, and a list of fun activities to do by yourselves or together with your families.</span>
                                    </td></tr>`);

  // After the 5th the profile is the secondary action (an inline plain link, since
  // the member just saw their profile at checkout); the Perks button is the signed one.
  const profileRows = (`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you prefer a match with your Post Perks, just wait until next month to use your first round! In order to find the best matches for you, we've put together a <a href="${SITE_URL}/profile" style="color:#666666;text-decoration:underline">profile</a>. If you haven't already, fill out as much — or as little — as you want; we'll find you a match next month with whatever information we have.
                                    </td></tr>`);


  // What to do this month depends on when they joined: before the 5th they can
  // still opt into this round's match; after it, matching has closed but Perks
  // (and the next round) are open. Nothing is used until they choose.
  const thisMonthRows = (`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 0px;line-height:1.4;mso-line-height-alt:22.4px">
                                      ${windowOpen
                                        ? `<span style="font-weight:700">This month:</span> Opt into this round by the 5th. Choose a match with perks or just perks. Choosing either uses one of your rounds; skipping is free.`
                                        : `<span style="font-weight:700">This month:</span> Matching for the current round has closed, but you can use Post Perks right away — which uses one of your rounds.`}
                                    </td></tr>`);

  const scheduleRows = (`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Here's what to expect from us each round:
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-align:left;padding:0 0 16px;line-height:1.43;mso-line-height-alt:22.9px">
                                      <span style="text-decoration:underline">1st to 5th of the month:</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Opt into your round</span>
                                      <span> by choosing a match, Post Perks, or both. You can always skip a round at no charge and keep your round.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-decoration:underline;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      7th of the month:
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Receive your match!</span>
                                      <span> Your introduction, accompanied by a whimsical piece of art from our community. Post Perks are yours to use all month long.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="text-decoration:underline">23rd of the month:</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 0px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">A little nudge</span>
                                      <span> to remind you to meet up, if you haven't done so already.</span>
                                    </td></tr>`);

  const body = windowOpen
    ? bodySection(welcomeRows + thisMonthRows) +
      ctaButton("Opt into this round", signInLink) +
      bodySection(scheduleRows)
    : bodySection(welcomeRows + thisMonthRows) +
      ctaButton("Opt into Perks this month", signInLink, "#d4e09b") +
      // Profile note and schedule share one block so the gap between them is a normal paragraph gap.
      bodySection(profileRows + scheduleRows);

  return baseEmail(
    headerImage + body,
    `<link rel="preload" as="image" href="${ASSETS_URL}/email-images/welcome.png">`
  );
}

export async function sendWelcomeEmail(
  email: string,
  firstName: string,
  signInLink: string,
  planLabel: string,
  // Defaults to today's state; the preview script passes both to show each.
  windowOpen: boolean = isOptinWindowOpen(),
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Welcome to Postpartum Post 💌`,
    html: welcomeHtml(firstName, signInLink, planLabel, windowOpen),
  });
  if (error) {
    console.error("[resend] sendWelcomeEmail error:", error);
    throw error;
  }
}
