import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

/** "August 29, 2026" */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function cancellationConfirmedHtml(firstName: string, accessUntil: Date): string {
  const formatted = formatDate(accessUntil);
  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      This confirms your Postpartum Post subscription has been canceled. You will not be charged again — your access stays active until <strong>${formatted}</strong>, and you're welcome to keep opting in to matches until then.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      Changed your mind? You can resubscribe any time, before or after that date.
                                    </td></tr>`) +
    ctaButton("Manage subscription", `${SITE_URL}/billing`);
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
  accessUntil: Date
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Your subscription has been canceled`,
    html: cancellationConfirmedHtml(firstName, accessUntil),
  });
  if (error) {
    console.error("[resend] sendCancellationConfirmedEmail error:", error);
    throw error;
  }
}
