import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

function accessLine(roundsLeft: number): string {
  if (roundsLeft > 0) {
    const noun = roundsLeft === 1 ? "round" : "rounds";
    return `You will not be charged again. You opted to keep using your remaining <strong>${roundsLeft} ${noun}</strong>, so you'll keep getting the monthly opt-in email until they're used. If you'd rather stop now, head to Billing and choose &ldquo;End everything now&rdquo;.`;
  }
  return "You will not be charged again, and you won't get any more opt-in emails from us.";
}

function cancellationConfirmedHtml(firstName: string, matchesRemaining: number): string {
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      This confirms your Postpartum Post membership has been canceled. ${accessLine(matchesRemaining)}
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      Changed your mind? You can resume or rejoin from your billing page any time.
                                    </td></tr>`) +
    ctaButton("Go to Billing", `${SITE_URL}/billing`);
  return baseEmail(content);
}

/**
 * Sent immediately when a member cancels (app/actions/unsubscribe.ts), not
 * at period end. Distinct from sendUnsubscribedEmail, which fires later —
 * on the Stripe customer.subscription.deleted webhook, once access has
 * actually ended — as a farewell rather than a cancellation notice.
 *
 * Billing-simplification Track E: this closes a compliance gap flagged
 * during the cutover review — previously nothing told a member their
 * cancellation had registered until weeks later, when the subscription
 * was actually deleted.
 */
export async function sendCancellationConfirmedEmail(
  email: string,
  firstName: string,
  matchesRemaining: number
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your membership has been canceled`,
    html: cancellationConfirmedHtml(firstName, matchesRemaining),
  });
  if (error) {
    console.error("[resend] sendCancellationConfirmedEmail error:", error);
    throw error;
  }
}
