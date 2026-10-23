import { formatCents, type ContinueOfferDetails } from "../continue-offer-pricing";
import { FROM, SITE_URL, getResend, bodySection, ctaButton, baseEmail, subjectPrefix, emailHeader, escapeHtml } from "./base";

const ROW = `font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px`;

/**
 * "Keep going?" email for a gifted member (comped, no cohort) whose free round
 * is used. Two checkout links (3 rounds, then 1 round) at the regular price:
 * the prices come from Stripe (ContinueOfferDetails), so the email shows what is
 * charged. Special offers go through cohorts (continue-cohort.ts), not here.
 * Plain relative imports only, so the send script can load this file directly.
 */
export function giftedContinueHtml(
  firstName: string,
  monthlyLink: string,
  bundleLink: string,
  offer: ContinueOfferDetails,
  perksIncluded: boolean
): string {
  const price = (plan: "standard_monthly" | "commitment_3mo") => {
    const p = offer.plans.find((x) => x.plan === plan)!;
    return `${p.label} for ${formatCents(p.regularCents)}`;
  };
  const perksLink = `<a href="${SITE_URL}/perks?utm_source=email&utm_campaign=gifted-continue" style="color:#000000;font-weight:700;text-decoration:underline;">Post Perks</a>`;
  const greeting = firstName.trim() ? `Hi ${escapeHtml(firstName.trim())},` : "Hi there,";

  const intro = `
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span style="font-weight:700">${greeting}</span>
                                      <span> your free round of Postpartum Post is done. We hope you got a lot out of it!</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>If you'd like to keep meeting new parents, you can continue with a plan below. Every round is a hand-picked 1:1 introduction${perksIncluded ? `, plus ${perksLink}` : ""}.</span>
                                    </td></tr>`;

  const afterRows = `
                                    ${perksIncluded ? "" : `<tr><td dir="ltr" style="${ROW}">
                                      <span>When you join as a full member, you also unlock ${perksLink} — local and online deals for parents.</span>
                                    </td></tr>`}
                                    <tr><td dir="ltr" style="${ROW}">
                                      <span>${escapeHtml(offer.durationNote)}</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>If you'd rather stop here, you don't need to do anything, and nothing will be charged. No pressure either way — the Postpartum Post way ❤️</span>
                                    </td></tr>`;

  return baseEmail(
    emailHeader() + bodySection(intro) + ctaButton(price("commitment_3mo"), bundleLink) + ctaButton(price("standard_monthly"), monthlyLink) + bodySection(afterRows)
  );
}

export async function sendGiftedContinueEmail(
  email: string,
  firstName: string,
  monthlyLink: string,
  bundleLink: string,
  offer: ContinueOfferDetails,
  perksIncluded: boolean
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${subjectPrefix()}Want to keep going with Postpartum Post?`,
    html: giftedContinueHtml(firstName, monthlyLink, bundleLink, offer, perksIncluded),
  });
  if (error) {
    console.error("[resend] sendGiftedContinueEmail error:", error);
    throw error;
  }
}
