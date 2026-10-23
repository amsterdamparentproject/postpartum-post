import { describe, it, expect, vi, beforeEach } from "vitest";

// sendGiftedContinueOffers against a small fake database: the same claim-before-
// send guard as the cohort job, plus "no cohort, comped, at 0" eligibility.
const { mockSendEmail, mockLoadPlans } = vi.hoisted(() => ({ mockSendEmail: vi.fn(), mockLoadPlans: vi.fn() }));
vi.mock("@/lib/emails/continue-gifted", () => ({ sendGiftedContinueEmail: mockSendEmail }));
vi.mock("@/lib/continue-offer-pricing", () => ({ loadRegularContinuePlans: mockLoadPlans }));
vi.mock("@/lib/tokens", () => ({ generateContinueToken: (id: string, plan: string) => `tok-${id}-${plan}` }));

import { sendGiftedContinueOffers } from "@/lib/gifted-continue-send";

type Member = { id: string; email: string; first_name: string | null; billing_mode: string };

function makeDb(opts: { members?: Member[]; alreadyClaimed?: string[]; noOfferCohorts?: string[]; events: string[]; filters: Record<string, unknown>[] }) {
  const alreadyClaimed = new Set(opts.alreadyClaimed ?? []);
  return {
    from(table: string) {
      let op: "select" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (table === "cohorts") return { data: (opts.noOfferCohorts ?? []).map((slug) => ({ slug })), error: null };
        if (op === "select") {
          opts.filters.push({ ...filters });
          return { data: opts.members ?? [], error: null };
        }
        const id = filters.id as string;
        if (payload.continue_offer_sent_at === null) {
          opts.events.push(`release:${id}`);
          return { data: null, error: null };
        }
        if (alreadyClaimed.has(id)) return { data: [], error: null };
        alreadyClaimed.add(id);
        opts.events.push(`claim:${id}`);
        return { data: [{ id }], error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        update: (p: Record<string, unknown>) => {
          op = "update";
          payload = p;
          return b;
        },
        in: (col: string, v: unknown) => ((filters[col] = v), b),
        lte: (col: string, v: unknown) => ((filters[col] = v), b),
        is: (col: string, v: unknown) => ((filters[col] = v), b),
        eq: (col: string, v: unknown) => ((filters[col] = v), b),
        or: (v: unknown) => ((filters.or = v), b),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return b;
    },
  };
}

const OFFER = {
  discountText: "",
  durationNote: "note",
  plans: [
    { plan: "standard_monthly", label: "1 round", regularCents: 1200, offerCents: 1200 },
    { plan: "commitment_3mo", label: "3 rounds", regularCents: 2400, offerCents: 2400 },
  ],
};
const M1: Member = { id: "m1", email: "a@example.test", first_name: "Holly", billing_mode: "comped_with_perks" };
const M2: Member = { id: "m2", email: "b@example.test", first_name: null, billing_mode: "comped_no_perks" };

describe("sendGiftedContinueOffers", () => {
  let events: string[];
  let filters: Record<string, unknown>[];
  const run = (members: Member[], extra: { alreadyClaimed?: string[]; noOfferCohorts?: string[]; dryRun?: boolean; onlyEmail?: string } = {}) =>
    sendGiftedContinueOffers(makeDb({ members, alreadyClaimed: extra.alreadyClaimed, noOfferCohorts: extra.noOfferCohorts, events, filters }) as never, {
      stripe: {} as never,
      siteUrl: "https://site.test",
      dryRun: extra.dryRun ?? false,
      onlyEmail: extra.onlyEmail,
    });

  beforeEach(() => {
    events = [];
    filters = [];
    mockSendEmail.mockReset().mockResolvedValue(undefined);
    mockLoadPlans.mockReset().mockResolvedValue(OFFER);
  });

  it("only asks for active comped members with no cohort, at 0 rounds, never sent", async () => {
    await run([M1]);
    expect(filters[0]).toMatchObject({
      or: "cohort.is.null",
      billing_mode: ["comped_no_perks", "comped_with_perks"],
      status: "active",
      matches_remaining: 0,
      continue_offer_sent_at: null,
    });
  });

  it("also covers members of a cohort that has no continue code", async () => {
    await run([M1], { noOfferCohorts: ["aic", "other"] });
    expect(filters[0].or).toBe("cohort.is.null,cohort.in.(aic,other)");
  });

  it("claims each member before emailing, with signed regular-price links and whether Perks are included", async () => {
    const [result] = await run([M1, M2]);
    expect(events).toEqual(["claim:m1", "claim:m2"]);
    expect(result).toMatchObject({ slug: "regular-price", eligible: 2, sent: 2, failed: 0 });
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      1, "a@example.test", "Holly",
      "https://site.test/api/continue?member_id=m1&plan=standard_monthly&token=tok-m1-standard_monthly",
      "https://site.test/api/continue?member_id=m1&plan=commitment_3mo&token=tok-m1-commitment_3mo",
      OFFER, true
    );
    expect(mockSendEmail.mock.calls[1][1]).toBe("");
    expect(mockSendEmail.mock.calls[1][5]).toBe(false);
  });

  it("a dry run claims and sends nothing", async () => {
    const [result] = await run([M1], { dryRun: true });
    expect(events).toEqual([]);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.members).toEqual([{ memberId: "m1", email: "a@example.test", outcome: "would_send" }]);
  });

  it("releases the claim when a send fails and carries on", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("boom"));
    const [result] = await run([M1, M2]);
    expect(events).toEqual(["claim:m1", "release:m1", "claim:m2"]);
    expect(result).toMatchObject({ sent: 1, failed: 1 });
  });

  it("skips a member someone else already claimed", async () => {
    const [result] = await run([M1], { alreadyClaimed: ["m1"] });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.members[0].outcome).toBe("skipped_already_claimed");
  });

  it("sends nothing, and says so, when the Stripe prices can't be loaded", async () => {
    mockLoadPlans.mockResolvedValue(null);
    const [result] = await run([M1]);
    expect(result.status).toBe("offer_unavailable");
    expect(events).toEqual([]);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns nothing when nobody is eligible", async () => {
    expect(await run([])).toEqual([]);
  });
});
