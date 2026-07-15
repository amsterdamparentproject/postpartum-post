import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember } from "@tests/helpers";
import { grantFreeMonth } from "@/lib/free-month-grants";

// --- Mocks ---

const { mockRetrieve, mockUpdate } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: mockRetrieve,
      update: mockUpdate,
    },
  }),
}));

const NOW = Math.floor(Date.now() / 1000);
const SECONDS_PER_DAY = 86_400;

function stripeMonthlySubResponse(metadata: Record<string, string> = {}) {
  return {
    metadata,
    items: {
      data: [
        {
          price: { lookup_key: "standard_monthly" },
          current_period_end: NOW + 15 * SECONDS_PER_DAY,
        },
      ],
    },
  };
}

function stripeFoundingSubResponse(metadata: Record<string, string> = {}) {
  return {
    metadata,
    items: {
      data: [
        {
          price: { lookup_key: "founding_member" },
          current_period_end: NOW + 60 * SECONDS_PER_DAY,
        },
      ],
    },
  };
}

describe("grantFreeMonth", () => {
  let memberId: string;

  beforeEach(() => {
    mockRetrieve.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("throws if no member exists for the given email", async () => {
    await expect(
      grantFreeMonth("nobody-here@example.com", "customer_service")
    ).rejects.toThrow(/No member found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("throws if the member has no active subscription", async () => {
    const member = await seedMember();
    memberId = member.id;
    // No seedSubscription() call — member exists but has no subscription row.

    await expect(
      grantFreeMonth(member.email, "customer_service")
    ).rejects.toThrow(/No active subscription/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("pauses collection through month-end for a monthly plan", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_monthly" });
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    const result = await grantFreeMonth(member.email, "customer_service");

    expect(result.plan).toBe("standard_monthly");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        pause_collection: expect.objectContaining({
          behavior: "void",
          resumes_at: expect.any(Number),
        }),
      })
    );
    // resumes_at must be in the future relative to now.
    const [, updateArgs] = mockUpdate.mock.calls[0];
    expect(updateArgs.pause_collection.resumes_at).toBeGreaterThan(NOW);
  });

  it("extends trial_end to the next 5th-of-month for a 3-month plan", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_founding" });
    const currentPeriodEnd = Math.floor(new Date("2026-10-05T00:00:00Z").getTime() / 1000);
    mockRetrieve.mockResolvedValue({
      metadata: {},
      items: {
        data: [{ price: { lookup_key: "founding_member" }, current_period_end: currentPeriodEnd }],
      },
    });

    const result = await grantFreeMonth(member.email, "art_comp");

    expect(result.plan).toBe("prepaid_3mo");
    const expectedNewEnd = Math.floor(new Date("2026-11-05T00:00:00Z").getTime() / 1000);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trial_end: expectedNewEnd,
        proration_behavior: "none",
      })
    );
    expect(result.newNextChargeDate.getTime()).toBe(expectedNewEnd * 1000);
  });

  it("self-corrects a 3-month plan whose period end has drifted off match day", async () => {
    // Regression test for the real bug this replaces: a subscription with a
    // period end that isn't exactly on the 5th (e.g. Oct 4, one day off)
    // used to get pushed a flat 30 days forward (landing on Nov 3/4 — still
    // off). It should now land back on the nearest 5th instead.
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_founding" });
    const currentPeriodEnd = Math.floor(new Date("2026-10-04T00:00:00Z").getTime() / 1000);
    mockRetrieve.mockResolvedValue({
      metadata: {},
      items: {
        data: [{ price: { lookup_key: "founding_member" }, current_period_end: currentPeriodEnd }],
      },
    });

    const result = await grantFreeMonth(member.email, "art_comp");

    const expectedNewEnd = Math.floor(new Date("2026-10-05T00:00:00Z").getTime() / 1000);
    expect(result.newNextChargeDate.getTime()).toBe(expectedNewEnd * 1000);
  });

  it("tags the subscription with grant_type, grant_reason, and granted_at", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_founding" });
    mockRetrieve.mockResolvedValue(stripeFoundingSubResponse());

    await grantFreeMonth(member.email, "art_comp");

    const [, updateArgs] = mockUpdate.mock.calls[0];
    expect(updateArgs.metadata).toMatchObject({
      grant_type: "free_month",
      grant_reason: "art_comp",
    });
    expect(typeof updateArgs.metadata.granted_at).toBe("string");
  });

  it("merges into existing subscription metadata instead of overwriting it", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_founding" });
    mockRetrieve.mockResolvedValue(
      stripeFoundingSubResponse({ existing_key: "keep-me" })
    );

    await grantFreeMonth(member.email, "customer_service");

    const [, updateArgs] = mockUpdate.mock.calls[0];
    expect(updateArgs.metadata).toMatchObject({
      existing_key: "keep-me",
      grant_type: "free_month",
      grant_reason: "customer_service",
    });
  });

  it("accepts an arbitrary reason string without validation", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_monthly" });
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    await expect(
      grantFreeMonth(member.email, "totally-made-up-reason")
    ).resolves.toMatchObject({ plan: "standard_monthly" });
  });
});
