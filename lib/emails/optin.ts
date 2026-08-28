import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

// Distinct utm_content from the footer's own "Manage subscription" link
// (lib/emails/base.ts's emailFooter) and from the match-reveal renewal
// notice's link (lib/billing-notice.ts's renewalNoticeCancelUrl) — same
// per-link-purpose tracking convention already used there.
function lastMatchNoticeBillingUrl(): string {
  return `${SITE_URL}/billing?utm_source=email&utm_campaign=transactional&utm_content=last-match-notice`;
}

function optinHtml(
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  skipUrl: string,
  lastMatchNotice: boolean
): string {
  // Billing plan §"Renewal timing" (Track E, 2026-08-26): the soft half of
  // the two-tier renewal notice. Fires a cycle earlier than the loud
  // match-reveal notice (lib/billing-notice.ts, Track C4) — while this
  // member still has one match left, not once they've already hit zero —
  // so a bundle member sees this coming before the (now 3-day, moved
  // earlier specifically to give SEPA settlement enough runway to clear
  // before the following round) gap between match reveal and the charge.
  const lastMatchLine = lastMatchNotice
    ? `<tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <strong>Notice — 1 match left.</strong> This may be your last match in your current bundle, and your bundle is set to renew next month. Go to your <a href="${lastMatchNoticeBillingUrl()}" style="color:#666666;text-decoration:underline">billing page</a> to make changes to your subscription.
                                    </td></tr>`
    : "";

  const content = emailHeader() + bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      It's the start of the month, which means that it's time to connect with a new parent nearby! Let us know how you'd like to meet this month — we'll take care of the rest.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You have until the <span style="font-weight:700">5th of the month</span> to respond. You'll receive your introduction on the 7th 💌
                                    </td></tr>
                                    ${lastMatchLine}`) +
    ctaButton("☕ Meet for coffee", coffeeUrl) +
    ctaButton("🛝 Meet for a playdate", playdateUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:13px;text-align:center;color:#666666;line-height:1.4;mso-line-height-alt:18.2px">
                                      Need a break? <a href="${skipUrl}" style="color:#666666;text-decoration:underline">Skip this month</a> for free — you'll keep your match, and we'll try again next month. If we don't hear from you, we'll assume you don't want to be matched this month.
                                    </td></tr>`);

  return baseEmail(content);
}

export async function sendOptinEmail(
  email: string,
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  skipUrl: string,
  lastMatchNotice = false
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Let's meet this month! 💌`,
    html: optinHtml(firstName, coffeeUrl, playdateUrl, skipUrl, lastMatchNotice),
  });
  if (error) {
    console.error("[resend] sendOptinEmail error:", error);
    throw error;
  }
}
