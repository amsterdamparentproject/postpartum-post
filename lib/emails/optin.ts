import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";
import { cohortHeader, COHORT_HEADER_PRELOAD } from "./welcome-cohort";

// Distinct utm_content from the footer's own "Manage subscription" link
// (lib/emails/base.ts's emailFooter) and from the match-reveal renewal
// notice's link (lib/billing-notice.ts's renewalNoticeCancelUrl) — same
// per-link-purpose tracking convention already used there.
function lastMatchNoticeBillingUrl(): string {
  return `${SITE_URL}/billing?utm_source=email&utm_campaign=transactional&utm_content=last-match-notice`;
}

export type OptinEmailOptions = {
  /** False for comped_no_perks members: no Perks buttons or mentions. */
  perksEnabled?: boolean;
  /**
   * Set for members whose match this round is within their cohort (a cohort
   * member who hasn't chosen "Anyone"). Switches on the cohort-branded header
   * and the note about meeting online.
   */
  cohortName?: string | null;
  /** True when the match is the cohort's free one (comped members): skipping the window uses it up. */
  cohortFreeMatch?: boolean;
};

function optinHtml(
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  perksUrl: string,
  skipUrl: string,
  lastMatchNotice: boolean,
  options: OptinEmailOptions = {}
): string {
  const { perksEnabled = true, cohortName = null, cohortFreeMatch = false } = options;
  // Billing plan §"Renewal timing" (Track E, 2026-08-26): the soft half of
  // the two-tier renewal notice. Fires a cycle earlier than the loud
  // match-reveal notice (lib/billing-notice.ts, Track C4) — while this
  // member still has one match left, not once they've already hit zero —
  // so a bundle member sees this coming before the (now 3-day, moved
  // earlier specifically to give SEPA settlement enough runway to clear
  // before the following round) gap between match reveal and the charge.
  // Below the CTAs and the "Skip" line, not above them -- this is a
  // secondary billing heads-up, not part of the primary ask, and sitting
  // above the buttons made it compete with them for attention.
  const lastMatchSection = lastMatchNotice
    ? bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0;line-height:1.4;mso-line-height-alt:22.4px">
                                      <strong>Notice — 1 match left.</strong> This may be your last match in your current bundle, and your bundle is set to renew next month. Go to your <a href="${lastMatchNoticeBillingUrl()}" style="color:#666666;text-decoration:underline">billing page</a> to make changes to your subscription.
                                    </td></tr>`)
    : "";

  const content = (cohortName ? cohortHeader() : emailHeader()) + bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      It's the start of the month, which means that it's time to connect with a new parent nearby! ${cohortName ? `This round you'll be matched with another parent from <span style="font-weight:700">${cohortName}</span>. ` : ""}Let us know how you'd like to meet this month — we'll take care of the rest.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You have until the <span style="font-weight:700">5th of the month</span> to respond. You'll receive your introduction on the 7th${perksEnabled ? ", along with all of the Post Perks for both of you" : ""} 💌
                                    </td></tr>${cohortName ? `
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Live outside Amsterdam?</span> No problem: ${cohortName} parents live all over, so you can be matched wherever you are. If you live near each other, try to meet in person! If not, a video call is a great way to practice Dutch together. You'll agree on what works once you're introduced.
                                    </td></tr>` : ""}`, true) +
    ctaButton(perksEnabled ? "☕ Coffee + perks" : "☕ Coffee", coffeeUrl) +
    ctaButton(perksEnabled ? "🛝 Playdate + perks" : "🛝 Playdate", playdateUrl) +
    (perksEnabled
      ? bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Don't have time to meet this month?</span> Instead, choose to access only your Post Perks to still get discounts and freebies across Amsterdam, just for you and your family.
                                    </td></tr>`) +
        ctaButton("🎁 No meetup, just perks", perksUrl)
      : "") +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:13px;text-align:center;color:#666666;line-height:1.4;mso-line-height-alt:18.2px">
                                      ${cohortFreeMatch && cohortName
        ? `This is your free match from ${cohortName}. Need a break? You can <a href="${skipUrl}" style="color:#666666;text-decoration:underline">skip this month</a> and use your free match next month — we just can't guarantee that you'll be matched with another ${cohortName} member.`
        : `Need a break? <a href="${skipUrl}" style="color:#666666;text-decoration:underline">Skip this month</a> for free. If we don't hear from you, we'll assume you don't want to be matched${perksEnabled ? " or access perks" : ""} this month.`}
                                    </td></tr>`) +
    lastMatchSection;

  return baseEmail(content, cohortName ? COHORT_HEADER_PRELOAD : undefined);
}

export async function sendOptinEmail(
  email: string,
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  perksUrl: string,
  skipUrl: string,
  lastMatchNotice = false,
  options: OptinEmailOptions = {}
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Let's meet this month! 💌`,
    html: optinHtml(firstName, coffeeUrl, playdateUrl, perksUrl, skipUrl, lastMatchNotice, options),
  });
  if (error) {
    console.error("[resend] sendOptinEmail error:", error);
    throw error;
  }
}
