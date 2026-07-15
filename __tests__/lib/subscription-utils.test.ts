import { describe, it, expect, vi, beforeEach } from "vitest";
import { extendSubscriptionToNext5th, cancelSubscription } from "@/lib/subscription-utils";

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

function stripeSubResponse(currentPeriodEndISO: string, metadata: Record<string, string> = {}) {
  return {
    metadata,
    items: {
      data: [{ current_period_end: Math.floor(new Date(currentPeriodEndISO).getTime() / 1000) }],
    },
  };
}

describe("extendSubscriptionToNext5th", () => {
  beforeEach(() => {
    mockRetrieve.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  it("pushes trial_end to the next 5th when the current period end is before it", async () => {
    mockRetrieve.mockResolvedValue(stripeSubResponse("2026-11-01T10:00:00Z"));

    const result = await extendSubscriptionToNext5th("sub_test");

    expect(mockUpdate).toHaveBeenCalledWith("sub_test", {
      trial_end: Math.floor(new Date("2026-11-05T00:00:00Z").getTime() / 1000),
      proration_behavior: "none",
    });
    expect(result.previousDate.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(result.newDate.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it("self-corrects to the same month's 5th when the period end has drifted off match day", async () => {
    // Regression test for the free-month-grant bug: a subscription whose
    // period end is Oct 5 minus a day or two (not aligned) should be
    // corrected back to the 5th, not pushed a full month past it.
    mockRetrieve.mockResolvedValue(stripeSubResponse("2026-10-04T00:00:00Z"));

    const result = await extendSubscriptionToNext5th("sub_test");

    expect(result.newDate.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("pushes a full cycle forward when the period end is already exactly on the 5th", async () => {
    mockRetrieve.mockResolvedValue(stripeSubResponse("2026-10-05T00:00:00Z"));

    const result = await extendSubscriptionToNext5th("sub_test");

    expect(result.newDate.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it("merges given metadata into the subscription's existing metadata", async () => {
    mockRetrieve.mockResolvedValue(
      stripeSubResponse("2026-11-01T10:00:00Z", { existing_key: "keep-me" })
    );

    await extendSubscriptionToNext5th("sub_test", { grant_type: "free_month" });

    expect(mockUpdate).toHaveBeenCalledWith(
      "sub_test",
      expect.objectContaining({
        metadata: { existing_key: "keep-me", grant_type: "free_month" },
      })
    );
  });

  it("does not touch metadata when none is given", async () => {
    mockRetrieve.mockResolvedValue(stripeSubResponse("2026-11-01T10:00:00Z"));

    await extendSubscriptionToNext5th("sub_test");

    const [, updateArgs] = mockUpdate.mock.calls[0];
    expect(updateArgs).not.toHaveProperty("metadata");
  });
});

describe("cancelSubscription", () => {
  it("sets cancel_at_period_end on the subscription", async () => {
    mockUpdate.mockResolvedValue({});
    await cancelSubscription("sub_test");
    expect(mockUpdate).toHaveBeenCalledWith("sub_test", { cancel_at_period_end: true });
  });
});
