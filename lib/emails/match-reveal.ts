import { FROM, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";
import type { BillingNotice } from "@/lib/billing-notice";

/**
 * Track C4 — billing plan §3.3's notice-volume table, rendered. Returns ""
 * for { kind: "none" } (comped/FYP members, and now every monthly member —
 * see lib/billing-notice.ts's doc comment) and for { kind: "counter" },
 * which moved out of the main body entirely — see
 * counterNoticeFooterHtml() below.
 */
/**
 * Track C4's "counter" tier — the always-shown, non-actionable bundle
 * match count. Moved out of the main body and into the footer's own
 * insertion point (base.ts's emailFooter `afterNonprofitBox`) per copy
 * review: as ambient status info (nothing to decide, nothing to click) it
 * was competing with the match-reveal narrative for attention up top, and
 * it's now positioned right above the footer's own "Manage subscription"
 * link instead of far away from it. Styled as plain black body text —
 * same weight as the footer's own "Happy connecting," row. "Loud" stays
 * in its pre-footer position — it already carries its own link and
 * arguably belongs in the main flow, not the footer, precisely because it
 * needs to be seen.
 *
 * The last-match line names the real renewal date (notice.renewDate) when
 * Stripe's currentPeriodEnd is known, matching /billing's own last-match
 * dateTooltip wording (lib/member-status.ts) — same fact, same words,
 * wherever a member reads it — and falls back to "soon" otherwise, same
 * as the loud tier's fallback.
 */
function counterNoticeFooterHtml(notice: BillingNotice): string | undefined {
  if (notice.kind !== "counter") {
    return undefined;
  }
  const line =
    notice.matchesRemaining >= 2
      ? `Note: You currently have <b>${notice.matchesRemaining} matches left</b> in your bundle.`
      : `🔔 You currently have <b>1 match left</b> in your bundle. Your subscription will renew ${notice.renewDate ? `on ${notice.renewDate} ` : "soon "}so that you continue receiving matches.`;
  return `
                  <tr><td dir="ltr" style="font-size:16px;color:#000000;text-align:left;padding:0 48px 16px;line-height:1.4;mso-line-height-alt:22.4px">
                    ${line}
                  </td></tr>`;
}

function billingNoticeHtml(notice: BillingNotice): string {
  if (notice.kind === "none" || notice.kind === "counter") {
    return "";
  }

  // notice.kind === "loud" — end of a bundle term, or first real charge
  // after a gift. Both get the full treatment (date, amount, a link to
  // make changes); only the opening line differs. Copy pass: dropped the
  // standalone "Manage your membership" CTA button in favor of one
  // paragraph ending in an inline link — the button read as more of a
  // hard sell than this notice (a factual heads-up, not an upsell)
  // warranted.
  const amountSuffix = notice.amount ? ` ${notice.amount}` : "";
  const intro = notice.isFirstAfterGift
    ? `This was your last free match from your gifted subscription!`
    : `You've used all the matches in your bundle.`;
  const billingPageLink = `<a href="${notice.cancelUrl}" style="color:#000000;text-decoration:underline;">Billing page</a>`;
  return bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <b>A note on your subscription:</b> ${intro} To keep matching, you'll be charged${amountSuffix} on ${notice.renewDate}. If you'd like to make changes ahead of next month's match round, go to your ${billingPageLink}.
                                    </td></tr>`);
}

function matchRevealHtml(
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchEmail: string,
  topic: string | null,
  matchPageUrl: string,
  matchesLink: string,
  isDoubleMatch: boolean,
  isRecipientInitiator: boolean,
  billingNotice: BillingNotice,
): string {
  const mailtoSubject = encodeURIComponent(`Let's meet for a ${topic || "hang"}! (Postpartum Post)`);
  const mailtoBody = encodeURIComponent(`Hi ${matchFirstName},`);

  const initiatorLine = isRecipientInitiator
    ? `Get started: To skip all that first-contact awkwardness, <b>we select 1 person from the match to initiate the conversation — and it's you!</b> You can reply directly to this email, or use the button below. Reach out to ${matchFirstName} in the next day or so; they'll be waiting ☺️`
    : `<b>Get started:</b> We've nudged ${matchFirstName} to start the conversation this month. Keep an eye on your inbox over the next day or two — or say hi now if you're eager to get started ☺️ You can reply directly to this email, or use the button below.`;

  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${recipientFirstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hurrah, your Post has arrived! 🎉📬 Your match for this month is <span style="font-weight:700">${matchFirstName} ${matchLastName}</span>, another parent in Amsterdam who is excited to connect. Check out your match page for some local activities and resources to inspire your meetup. Enjoy your ${topic || "hang"}! 
                                    </td></tr>`, true) +
    ctaButton("See your match page", matchPageUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      ${initiatorLine}
                                    </td></tr>`, true) +
    ctaButton(`Email ${matchFirstName} now`, `mailto:${matchEmail}?subject=${mailtoSubject}&body=${mailtoBody}`) +
    bodySection(`                 
                                    <tr><td dir="ltr" style="font-size:14px;color:#666666;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:19.6px">
                                      Please make sure to review our <a href="https://postpartumpost.com/community-guidelines" style="color:#000000;text-decoration:underline;">Community Guidelines</a> before interacting with your match — to keep things safe and joyful for all. If this match isn&apos;t working out, you can request a rematch from your <a href="${matchesLink}" style="color:#000000;text-decoration:underline;">matches page</a> before the 14th of the month.
                                    </td></tr>
                                    ${isDoubleMatch ? `<tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:22.4px">
                                      A quick note: Due to your profile preferences and our odd-numbered parent pool this month, we matched you twice! We hope you enjoy your extra connection ❤️ If you don't want 2 matches next month, make sure to change the setting in your profile.
                                    </td></tr>` : ""}`,
      // tightBottom drops this section's own bottom padding so it doesn't
      // stack with the loud notice's bodySection right below it — without
      // it the two independently-padded sections leave a visibly oversized
      // gap between the Community Guidelines paragraph and "A note on your
      // subscription:". Only for "loud": "counter" doesn't render inline
      // at all (it's in the footer), so there's no adjacent section to
      // collide with there.
      billingNotice.kind === "loud") +
    billingNoticeHtml(billingNotice);
  return baseEmail(content, "", { afterNonprofitBox: counterNoticeFooterHtml(billingNotice) });
}

export async function sendMatchRevealEmail(
  recipientEmail: string,
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchEmail: string,
  topic: string | null,
  matchPageUrl: string,
  matchesLink: string,
  isDoubleMatch = false,
  isRecipientInitiator = false,
  // Track C4 — appended rather than inserted earlier in the list so
  // existing positional-arg test assertions (topic at index 5) don't shift.
  // Defaults to "none" so every other caller/test not yet passing this
  // stays exactly as it behaved before C4.
  billingNotice: BillingNotice = { kind: "none" },
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    // Invisible fallback: if the recipient just hits "Reply" instead of using
    // the "Email {name} now" button, it still lands with their match — not us.
    replyTo: matchEmail,
    subject: `${subjectPrefix()}Your Postpartum Post match for ${new Date().toLocaleString("en-US", { month: "long" })} is here 💌`,
    html: matchRevealHtml(
      recipientFirstName,
      matchFirstName,
      matchLastName,
      matchEmail,
      topic,
      matchPageUrl,
      matchesLink,
      isDoubleMatch,
      isRecipientInitiator,
      billingNotice,
    ),
  });
  if (error) {
    console.error("[resend] sendMatchRevealEmail error:", error);
    throw error;
  }
}
