import { FROM, getResend, bodySection, ctaButton, baseEmail, subjectPrefix, emailHeader, escapeHtml } from "./base";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;
const LAST_ROW = `font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px`;

const roundsText = (n: number) => (n === 1 ? "a free round" : `${n} free rounds`);

/**
 * Email for someone who is already a member and has just been given free rounds
 * from /admin/members (lib/comp-member.ts). Unlike giftedWelcomeHtml there's no
 * welcome, consent line or Perks pitch: they already have an account, so it says
 * what was added, what they have now, and points them to /billing for their plan.
 * The button's `link` should sign them in to /billing. An optional note from the
 * admin replaces the "Good news!" opening.
 */
export function giftedRoundsHtml(opts: {
  firstName: string;
  rounds: number;
  /** matches_remaining after the grant. */
  total: number;
  link: string;
  note?: string | null;
}): string {
  const { firstName, rounds, total, link, note } = opts;
  const greeting = firstName.trim()
    ? `<tr><td dir="ltr" style="${ROW}"><span>Hi ${escapeHtml(firstName.trim())},</span></td></tr>`
    : "";
  const opening = escapeHtml(note?.trim() || "Good news!");
  const rows = `${greeting}
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">${opening}</span>
                                      <span> We've added ${roundsText(rounds)} to your Postpartum Post account ❤️ You now have ${total} ${total === 1 ? "round" : "rounds"} to use.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${LAST_ROW}">
                                      <span>You can check out your plan and billing details for updated information on your membership. If you have any questions, just reply to this email!</span>
                                    </td></tr>`;

  return baseEmail(emailHeader() + bodySection(rows) + ctaButton("Go to billing", link));
}

export async function sendGiftedRoundsEmail(
  email: string,
  opts: { firstName: string; rounds: number; total: number; link: string; note?: string | null }
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}You've been gifted ${roundsText(opts.rounds)} of Postpartum Post 💌`,
    html: giftedRoundsHtml(opts),
  });
  if (error) {
    console.error("[resend] sendGiftedRoundsEmail error:", error);
    throw error;
  }
}
