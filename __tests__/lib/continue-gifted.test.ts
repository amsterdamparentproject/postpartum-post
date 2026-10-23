import { describe, it, expect, vi } from "vitest";
import { giftedContinueHtml } from "@/lib/emails/continue-gifted";
import { loadRegularContinuePlans, type ContinueOfferDetails } from "@/lib/continue-offer-pricing";

const MONTHLY = "https://example.test/api/continue?plan=standard_monthly";
const BUNDLE = "https://example.test/api/continue?plan=commitment_3mo";
const OFFER: ContinueOfferDetails = {
  discountText: "",
  durationNote: "Your plan renews when your rounds run out, and you can cancel anytime.",
  plans: [
    { plan: "standard_monthly", label: "1 round", regularCents: 1200, offerCents: 1200 },
    { plan: "commitment_3mo", label: "3 rounds", regularCents: 2400, offerCents: 2400 },
  ],
};
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

describe("giftedContinueHtml", () => {
  it("greets by name, shows the regular prices and links each plan", () => {
    const html = giftedContinueHtml("Robin", MONTHLY, BUNDLE, OFFER, true);
    expect(html).toContain("Hi Robin,");
    expect(html).toContain("3 rounds for €24");
    expect(html).toContain("1 round for €12");
    expect(hrefs(html)).toEqual(expect.arrayContaining([MONTHLY, BUNDLE]));
    expect(html).not.toContain("usually");
    expect(html).not.toContain("% off");
  });

  it("falls back to a plain greeting without a name, and escapes it", () => {
    expect(giftedContinueHtml("", MONTHLY, BUNDLE, OFFER, true)).toContain("Hi there,");
    expect(giftedContinueHtml("<b>x</b>", MONTHLY, BUNDLE, OFFER, true)).not.toContain("<b>x</b>");
  });

  it("mentions unlocking Post Perks only for members who don't have them yet", () => {
    expect(giftedContinueHtml("A", MONTHLY, BUNDLE, OFFER, false)).toContain("you also unlock");
    expect(giftedContinueHtml("A", MONTHLY, BUNDLE, OFFER, true)).not.toContain("you also unlock");
  });
});

describe("loadRegularContinuePlans", () => {
  const stripe = (prices: Record<string, { unit_amount: number | null; currency: string } | undefined>) =>
    ({ prices: { list: vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => ({ data: prices[lookup_keys[0]] ? [prices[lookup_keys[0]]] : [] })) } }) as never;

  it("returns both plans at the regular price with no discount", async () => {
    const offer = await loadRegularContinuePlans(
      stripe({ standard_monthly: { unit_amount: 1200, currency: "eur" }, commitment_3mo: { unit_amount: 2400, currency: "eur" } })
    );
    expect(offer?.discountText).toBe("");
    expect(offer?.plans.map((p) => [p.plan, p.regularCents, p.offerCents])).toEqual([
      ["standard_monthly", 1200, 1200],
      ["commitment_3mo", 2400, 2400],
    ]);
  });

  it("is null when a plan price is missing", async () => {
    expect(await loadRegularContinuePlans(stripe({ standard_monthly: { unit_amount: 1200, currency: "eur" } }))).toBeNull();
  });
});

describe("giftedWelcomeHtml", () => {
  it("opens with Welcome! by default", async () => {
    const { giftedWelcomeHtml } = await import("@/lib/emails/welcome-gifted");
    expect(giftedWelcomeHtml("https://x.test", true)).toContain(">Welcome!</span>");
  });

  it("replaces the opening with the admin's note, escaped, and keeps the rest", async () => {
    const { giftedWelcomeHtml } = await import("@/lib/emails/welcome-gifted");
    const html = giftedWelcomeHtml("https://x.test", true, "Congrats, Holly — you won our Post Perks giveaway! <b>");
    expect(html).toContain("Congrats, Holly — you won our Post Perks giveaway! &lt;b&gt;");
    expect(html).not.toContain(">Welcome!</span>");
    expect(html).toContain("You've been gifted a free round to Postpartum Post.");
  });

  it("puts the consent line under the button and links the guidelines", async () => {
    const { giftedWelcomeHtml } = await import("@/lib/emails/welcome-gifted");
    const html = giftedWelcomeHtml("https://x.test/enter", false);
    expect(html).toContain("By clicking, you agree to our ");
    expect(html).toContain("/community-guidelines");
    expect(html).toContain("18 or older");
    expect(html.indexOf("Go to your profile")).toBeLessThan(html.indexOf("By clicking, you agree"));
  });

  it("builds the entry link with a consent token tied to the member id", async () => {
    const { consentEntryLink } = await import("@/lib/emails/welcome-gifted");
    const { verifyConsentToken } = await import("@/lib/tokens");
    const url = new URL(consentEntryLink("member-1"));
    expect(url.pathname).toBe("/api/consent/enter");
    expect(url.searchParams.get("member_id")).toBe("member-1");
    expect(verifyConsentToken("member-1", url.searchParams.get("token")!)).toBe(true);
    expect(verifyConsentToken("member-2", url.searchParams.get("token")!)).toBe(false);
  });

  it("ignores a blank note", async () => {
    const { giftedWelcomeHtml } = await import("@/lib/emails/welcome-gifted");
    expect(giftedWelcomeHtml("https://x.test", false, "   ")).toContain(">Welcome!</span>");
  });
});
