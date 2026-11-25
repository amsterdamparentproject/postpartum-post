import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, emailHeader, subjectPrefix } from "./base";

// One-off email to members who canceled but still have rounds left (see
// lib/canceling-explainer-send.ts and scripts/send-canceling-explainer.mts).
// Each link gets its own utm_content, same per-link-purpose convention as the
// opt-in email. `end=1` opens the "End everything now" dialog on /billing.
function billingUrl(content: string, extra = ""): string {
  return `${SITE_URL}/billing?utm_source=email&utm_campaign=transactional&utm_content=${content}${extra}`;
}

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;
// Last row before the footer: no bottom padding, or the gap above the sign-off gets too big.
const ROW_LAST = `font-size:16px;text-align:left;padding:0;line-height:1.4;mso-line-height-alt:22.4px`;

function cancelingExplainerHtml(firstName: string, roundsLeft: number, canceledAt: string | null): string {
  const one = roundsLeft === 1;
  const roundWord = one ? "round" : "rounds";
  // The date is only known for cancellations since members.canceled_at was added.
  const onDate = canceledAt
    ? ` on ${new Date(canceledAt).toLocaleDateString("en-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" })}`
    : "";
  const billingLink = `<a href="${billingUrl("canceling-explainer")}" style="color:#000000;text-decoration:underline">Billing</a>`;

  const content =
    emailHeader() +
    bodySection(`
                                    <tr><td dir="ltr" style="${ROW}">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      Alex here 👋🏻 I've gotten feedback from folks in the last round that cancellation is confusing, so I made some updates and wanted to let you know! We currently have you as canceled but with ${one ? "a round" : "rounds"} left, so hopefully this email explains things better.
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      You canceled your Postpartum Post membership${onDate}, so you won't be charged again. You still have ${roundsLeft} ${roundWord} left that you've already paid for, which is why you keep getting our monthly opt-in email on the 1st — it's your invitation to use one.
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <b>If you want to keep using your ${roundWord}</b>, there's nothing to do. Opt in (or skip) between the 1st and the 5th of each month until ${one ? "it's" : "they're"} used.
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      If you prefer to <b>end everything now</b>, you can do that, too. This means no more opt-in emails, and it forfeits your remaining ${roundWord}. You won't be part of a Postpartum Post round again unless you rejoin.
                                    </td></tr>`, true) +
    ctaButton("End everything now", billingUrl("canceling-explainer-end", "&end=1"), "#E5E7EB") +
    bodySection(`
                                    <tr><td dir="ltr" style="${ROW}">
                                      Changed your mind? You can resume your membership from ${billingLink} anytime, and it will renew as usual when your ${roundWord} ${one ? "runs" : "run"} out.
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW_LAST}">
                                      Thank you so much for being a part of Postpartum Post and growing this little community! I'm always open to feedback and ideas on how to make it better — you can just reply right to this email.
                                    </td></tr>`, true);
  return baseEmail(content, "", { signoff: "All the best," });
}

export async function sendCancelingExplainerEmail(
  email: string,
  firstName: string,
  roundsLeft: number,
  canceledAt: string | null = null
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Postpartum Post: Update on your canceling membership`,
    html: cancelingExplainerHtml(firstName, roundsLeft, canceledAt),
  });
  if (error) {
    console.error("[resend] sendCancelingExplainerEmail error:", error);
    throw error;
  }
}
