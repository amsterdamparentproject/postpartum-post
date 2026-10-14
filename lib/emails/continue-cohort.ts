import { formatEuros, type ContinueOfferDetails } from "../continue-offer-pricing";
import { FROM, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;

/**
 * "Keep going?" email for comped cohort members whose free match is used.
 * Two checkout links (1 round, 3 rounds) share the cohort's promotion code. The
 * discount and prices come from Stripe (ContinueOfferDetails), so the email
 * always shows what is charged.
 * Plain relative imports only, so the send script can load this file directly.
 */
export function cohortContinueHtml(
  firstName: string,
  cohortName: string,
  monthlyLink: string,
  bundleLink: string,
  offer: ContinueOfferDetails
): string {
  const price = (plan: "standard_monthly" | "commitment_3mo") => {
    const p = offer.plans.find((x) => x.plan === plan)!;
    return `${p.label} for ${formatEuros(p.offerCents)} (usually ${formatEuros(p.regularCents)})`;
  };
  const intro = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">Hi ${firstName},</span>
                                      <span> your free match from ${cohortName} is done. We hope it was a good one!</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>If you'd like another round, here's a thank-you for joining us early: <b>${offer.discountText}</b>. Your next match arrives like a joyful little letter, just like the first, and Post Perks (local deals for parents) unlock too.</span>
                                    </td></tr>`;

  const afterRows = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>${offer.durationNote}</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>No pressure either way. If you'd rather stop here, you don't need to do anything, and nothing will be charged.</span>
                                    </td></tr>`;

  return baseEmail(
    bodySection(intro) +
      ctaButton(price("standard_monthly"), monthlyLink) +
      ctaButton(price("commitment_3mo"), bundleLink) +
      bodySection(afterRows)
  );
}

export async function sendCohortContinueEmail(
  email: string,
  firstName: string,
  cohortName: string,
  monthlyLink: string,
  bundleLink: string,
  offer: ContinueOfferDetails
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}A thank-you for your first match 💌`,
    html: cohortContinueHtml(firstName, cohortName, monthlyLink, bundleLink, offer),
  });
  if (error) {
    console.error("[resend] sendCohortContinueEmail error:", error);
    throw error;
  }
}
