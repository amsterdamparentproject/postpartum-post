import { FROM, ASSETS_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix, emailHeader, escapeHtml } from "./base";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;

/**
 * Double-branded header (Dutch Speaking Academy and Postpartum Post), shared by
 * the cohort welcome email and the cohort version of the monthly opt-in email.
 */
export function cohortHeader(): string {
  return `
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
}

export const COHORT_HEADER_PRELOAD = `<link rel="preload" as="image" href="${ASSETS_URL}/email-images/welcome-dsa.png">`;

/**
 * Per-cohort pieces of the welcome email (from lib/cohort-config.ts, passed in
 * so this file doesn't depend on it). Anything unset falls back to the generic
 * version: the standard header and cohort-neutral wording.
 */
export type CohortWelcomeOptions = {
  headerHtml?: string | null;
  headerPreload?: string | null;
  /** Plain-text paragraph describing the match, replacing "Every month is a match: ...". */
  matchLine?: string | null;
  /** Plain-text sentence replacing the "If you want to keep meeting new parents..." line. */
  continueLine?: string | null;
  /** Plain-text sentence saying the match is a gift, replacing "This match is a gift — there's no charge, and nothing renews on its own." */
  giftLine?: string | null;
};

/**
 * Welcome email for comped cohort members. They never saw a billing screen, so
 * the closing note says the match is a gift from their course, nothing is
 * charged, and nothing renews. The 1st to 5th opt-in window is explained above
 * the button.
 */
export function cohortWelcomeHtml(
  firstName: string,
  signInLink: string,
  cohortName: string,
  options: CohortWelcomeOptions = {}
): string {
  const { headerHtml = null, headerPreload = null, matchLine = null, continueLine = null, giftLine = null } = options;
  const headerImage = headerHtml ?? emailHeader();
  const match = escapeHtml(
    matchLine ??
      `Every month is a match: We send you a hand-picked introduction via email to another parent from ${cohortName} — in person if you live nearby or on a video call if you don't.`
  );
  const gift = escapeHtml(giftLine ?? "This match is a gift — there's no charge, and nothing renews on its own.");
  const keepGoing = escapeHtml(
    continueLine ??
      "If you want to keep meeting new parents afterwards, keep an eye on your inbox at the end of the month!"
  );

  const rows = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">Welcome, ${firstName}!</span>
                                      <span> We're really excited to have you in the community. You've joined the ${cohortName} cohort, and your free match is waiting.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>${match}</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">What's next:</span>
                                      <span> Make sure to opt in between the 1st and the 5th of the month to get your match. We'll email you when the window opens, and your match arrives on the 7th.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>In the meantime, you can fill out your profile so we can find you a good match. Share as much or as little as you like.</span>
                                    </td></tr>`;

  const afterRows = `
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>${gift} ${keepGoing}</span>
                                    </td></tr>`;

  return baseEmail(
    headerImage + bodySection(rows) + ctaButton("Go to my profile", signInLink) + bodySection(afterRows),
    headerPreload ?? undefined
  );
}

export async function sendCohortWelcomeEmail(
  email: string,
  firstName: string,
  signInLink: string,
  cohortName: string,
  options: CohortWelcomeOptions = {}
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your free match is ready 💌`,
    html: cohortWelcomeHtml(firstName, signInLink, cohortName, options),
  });
  if (error) {
    console.error("[resend] sendCohortWelcomeEmail error:", error);
    throw error;
  }
}

/**
 * Confirmation for an existing, paying member who joined a cohort with its code
 * (billing page or splash page). Unlike cohortWelcomeHtml, their plan is
 * unchanged: the free round is on top of it, and nothing about billing is said
 * to stop. Also tells the real owner of the inbox that a code was used on the
 * account.
 */
export function cohortExistingMemberHtml(signInLink: string, cohortName: string): string {
  const rows = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">Welcome to the ${cohortName} in Postpartum Post!</span>
                                      <span> The code you entered has granted you 1 free round, included with your course — when you use it next month, you'll be matched with another member of the ${cohortName}.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>Nothing changes about your plan or billing. The free round is on top of it. Per usual, you can opt in between the 1st and the 5th of the month, and your match arrives on the 7th.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>Didn't use a code? Reply to this email and we'll sort it out.</span>
                                    </td></tr>`;
  return baseEmail(bodySection(rows) + ctaButton("Go to my account", signInLink));
}

export async function sendCohortExistingMemberEmail(
  email: string,
  signInLink: string,
  cohortName: string
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your free round is added 💌`,
    html: cohortExistingMemberHtml(signInLink, cohortName),
  });
  if (error) {
    console.error("[resend] sendCohortExistingMemberEmail error:", error);
    throw error;
  }
}
