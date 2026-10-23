import { describe, it, expect } from "vitest";
import { cohortContinueHtml } from "@/lib/emails/continue-cohort";
import {
  applyCoupon,
  describeDiscount,
  describeDuration,
  formatCents,
  formatEuros,
  type ContinueOfferDetails,
} from "@/lib/continue-offer-pricing";

const MONTHLY = "https://example.test/api/continue?plan=standard_monthly";
const BUNDLE = "https://example.test/api/continue?plan=commitment_3mo";

const OFFER: ContinueOfferDetails = {
  discountText: "€4 off",
  durationNote: describeDuration({ amount_off: 400, percent_off: null, currency: "eur", duration: "once", duration_in_months: null }),
  plans: [
    { plan: "standard_monthly", label: "1 round", regularCents: 1200, offerCents: 800 },
    { plan: "commitment_3mo", label: "3 rounds", regularCents: 2400, offerCents: 2000 },
  ],
};

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

describe("cohortContinueHtml", () => {
  const html = cohortContinueHtml("Robin", "Dutch Speaking Academy", MONTHLY, BUNDLE, OFFER);

  it("greets by name and names the cohort", () => {
    expect(html).toContain("Hi Robin,");
    expect(html).toContain("Dutch Speaking Academy");
  });

  it("has one button per plan, on that plan's link", () => {
    expect(hrefs(html)).toContain(MONTHLY);
    expect(hrefs(html)).toContain(BUNDLE);
  });

  it("shows the discount and prices it was given", () => {
    expect(html).toContain("€4 off");
    expect(html).toContain("1 round for €8 (usually €12)");
    expect(html).toContain("3 rounds for €20 (usually €24)");
  });

  it("explains how long the discount lasts", () => {
    expect(html).toMatch(/membership discount applies to your first payment only/i);
    expect(html).toMatch(/renews at the regular price/i);
  });

  it("puts the 3-round button before the 1-round button", () => {
    const links = hrefs(html);
    expect(links.indexOf(BUNDLE)).toBeGreaterThan(-1);
    expect(links.indexOf(BUNDLE)).toBeLessThan(links.indexOf(MONTHLY));
  });

  it("names the cohort in the offer and says nothing will be charged if they stop", () => {
    expect(html).toContain("Dutch Speaking Academy and Postpartum Post have teamed up");
    expect(html).toContain("€4 off</b> of a Postpartum Post membership");
    expect(html).toMatch(/nothing will be charged/i);
  });

  it("links Post Perks to the public /perks page", () => {
    const perksLinks = hrefs(html).filter((h) => h.includes("/perks"));
    expect(perksLinks).toHaveLength(1);
    // The host is SITE_URL (postpartumpost.com in production, localhost under test).
    expect(perksLinks[0]).toMatch(/^https?:\/\/[^/]+\/perks\?utm_source=email&utm_campaign=cohort-continue$/);
    expect(html).toMatch(/<a href="[^"]*\/perks\?[^"]*"[^>]*>Post Perks<\/a>/);
  });

  it("shows the Post Perks value when it has one, and leaves it out otherwise", () => {
    expect(cohortContinueHtml("Robin", "Dutch Speaking Academy", MONTHLY, BUNDLE, OFFER, 312)).toContain(
      "local and online deals for parents currently worth €312."
    );
    for (const none of [null, 0]) {
      const h = cohortContinueHtml("Robin", "Dutch Speaking Academy", MONTHLY, BUNDLE, OFFER, none);
      expect(h).toContain("local and online deals for parents.");
      expect(h).not.toContain("currently worth");
    }
    expect(html).not.toContain("currently worth"); // the default is no figure
  });
});

describe("continue offer pricing", () => {
  const eur = { currency: "eur", duration: "once" as const, duration_in_months: null };

  it("applies an amount-off coupon, in the same currency only", () => {
    expect(applyCoupon(1200, "eur", { ...eur, amount_off: 400, percent_off: null })).toBe(800);
    expect(applyCoupon(1200, "usd", { ...eur, amount_off: 400, percent_off: null })).toBeNull();
    expect(applyCoupon(300, "eur", { ...eur, amount_off: 400, percent_off: null })).toBe(0);
  });

  it("applies a percent-off coupon", () => {
    expect(applyCoupon(1200, "eur", { ...eur, amount_off: null, percent_off: 50 })).toBe(600);
    expect(applyCoupon(2400, "eur", { ...eur, amount_off: null, percent_off: 25 })).toBe(1800);
  });

  it("formats euros and the discount", () => {
    expect(formatCents(800)).toBe("€8");
    expect(formatCents(850)).toBe("€8.50");
    expect(formatEuros(108)).toBe("€108");
    expect(formatEuros(6.5)).toBe("€6.50");
    expect(describeDiscount({ ...eur, amount_off: 400, percent_off: null })).toBe("€4 off");
    expect(describeDiscount({ ...eur, amount_off: null, percent_off: 50 })).toBe("50% off");
  });

  it("describes once, repeating and forever coupons", () => {
    expect(describeDuration({ ...eur, amount_off: 400, percent_off: null })).toMatch(/first payment only/);
    expect(describeDuration({ ...eur, amount_off: 400, percent_off: null, duration: "repeating", duration_in_months: 3 })).toMatch(/first 3 months/);
    expect(describeDuration({ ...eur, amount_off: 400, percent_off: null, duration: "forever" })).toMatch(/as long as you're a member/);
  });
});
