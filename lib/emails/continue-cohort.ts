import { formatCents, formatEuros, type ContinueOfferDetails } from "../continue-offer-pricing";
import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix } from "./base";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;

/**
 * "A thank-you for joining us" email for comped cohort members whose free match
 * is used. Two checkout links (3 rounds, then 1 round) share the cohort's
 * promotion code. The discount and prices come from Stripe
 * (ContinueOfferDetails), so the email always shows what is charged, and the
 * Post Perks total is the live perks' estimated value (null hides it).
 * Plain relative imports only, so the send script can load this file directly.
 */
export function cohortContinueHtml(
  firstName: string,
  cohortName: string,
  monthlyLink: string,
  bundleLink: string,
  offer: ContinueOfferDetails,
  perksTotal: number | null = null
): string {
  const price = (plan: "standard_monthly" | "commitment_3mo") => {
    const p = offer.plans.find((x) => x.plan === plan)!;
    return `${p.label} for ${formatCents(p.offerCents)} (usually ${formatCents(p.regularCents)})`;
  };
  const perksLink = `<a href="${SITE_URL}/perks?utm_source=email&utm_campaign=cohort-continue" style="color:#000000;text-decoration:underline;">Post Perks</a>`;
  const perksWorth = perksTotal && perksTotal > 0 ? ` currently worth ${formatEuros(perksTotal)}` : "";
  const intro = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">Hi ${firstName},</span>
                                      <span> your free match from ${cohortName} is done. We hope you got a lot out of it!</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>To keep the connections flowing, ${cohortName} and Postpartum Post have teamed up with a special continue offer: <b>${offer.discountText}</b> of a Postpartum Post membership. This way, you can keep meeting parents in your cohort — we really believe that routinely matching 1:1 makes all the difference in building meaningful community.</span>
                                    </td></tr>`;

  const afterRows = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>When you join as a full member, you also unlock ${perksLink} — local and online deals for parents${perksWorth}. ${offer.durationNote}</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>If you'd rather stop here, you don't need to do anything, and nothing will be charged. No pressure either way — the Postpartum Post way ❤️</span>
                                    </td></tr>`;

  return baseEmail(
    bodySection(intro) +
      ctaButton(price("commitment_3mo"), bundleLink) +
      ctaButton(price("standard_monthly"), monthlyLink) +
      bodySection(afterRows)
  );
}

export async function sendCohortContinueEmail(
  email: string,
  firstName: string,
  cohortName: string,
  monthlyLink: string,
  bundleLink: string,
  offer: ContinueOfferDetails,
  perksTotal: number | null = null
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}A thank-you for joining us`,
    html: cohortContinueHtml(firstName, cohortName, monthlyLink, bundleLink, offer, perksTotal),
  });
  if (error) {
    console.error("[resend] sendCohortContinueEmail error:", error);
    throw error;
  }
}
