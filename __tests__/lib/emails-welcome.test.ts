/**
 * Welcome email: two variants, chosen by whether the opt-in window (1st-5th)
 * was open when the member joined. The one signed link the webhook mints is
 * the primary button in each: "Opt into this round" before the 5th,
 * "Opt into Perks this month" after. Profile is a plain inline link after.
 */

import { describe, it, expect } from "vitest";
import { welcomeHtml } from "@/lib/emails/welcome";
import { SITE_URL } from "@/lib/emails/base";

const SIGNED = "https://example.test/auth/signed-link";
const PLAN = "3-round bundle (€24 for 3 rounds)";

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

describe("welcomeHtml — joined while the opt-in window is open", () => {
  const html = welcomeHtml("Robin", SIGNED, PLAN, true);

  it("has an 'Opt into this round' button on the signed link", () => {
    expect(html).toContain("Opt into this round");
    expect(hrefs(html)).toContain(SIGNED);
  });

  it("explains this month's choice and that skipping is free", () => {
    expect(html).toMatch(/opt into this round by the 5th/i);
    expect(html).toMatch(/skipping is free/i);
  });

  it("drops the profile CTA and the after-the-5th wording", () => {
    expect(html).not.toContain("Go to your profile");
    expect(html).not.toContain("Opt into Perks this month");
    expect(html).not.toMatch(/has closed/i);
    expect(hrefs(html)).not.toContain(`${SITE_URL}/profile`);
  });

  it("names the plan and uses rounds, with no billing date", () => {
    expect(html).toContain(PLAN);
    expect(html).toMatch(/only when your rounds run out/i);
    expect(html).not.toMatch(/next billing|first billing/i);
  });
});

describe("welcomeHtml — joined after the 5th", () => {
  const html = welcomeHtml("Robin", SIGNED, PLAN, false);

  it("has an 'Opt into Perks this month' button on the signed link", () => {
    expect(html).toContain("Opt into Perks this month");
    expect(hrefs(html)).toContain(SIGNED);
    expect(html).not.toContain("Opt into this round");
  });

  it("says matching has closed, Perks use a round, and the match waits for next month", () => {
    expect(html).toMatch(/Matching for the current round has closed/);
    expect(html).toMatch(/uses one of your rounds/);
    expect(html).toMatch(/wait until next month to use your first round/);
  });

  it("links 'profile' inline to the plain /profile page and has no profile button", () => {
    expect(html).not.toContain("Go to your profile");
    expect(html).toContain(`<a href="${SITE_URL}/profile"`);
  });

  it("has exactly one button-style link (the signed one)", () => {
    expect(hrefs(html).filter((h) => h === SIGNED)).toHaveLength(2); // button href appears in the VML fallback too
  });
});

describe("welcomeHtml — shared", () => {
  it.each([true, false])("keeps the per-round schedule (windowOpen=%s)", (open) => {
    const html = welcomeHtml("Robin", SIGNED, PLAN, open);
    expect(html).toContain("Here's what to expect from us each round:");
    expect(html).toContain("1st to 5th of the month:");
    expect(html).toContain("23rd of the month:");
  });
});
