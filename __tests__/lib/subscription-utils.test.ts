import { describe, it, expect, vi, beforeEach } from "vitest";
import { cancelSubscription } from "@/lib/subscription-utils";

const { mockUpdate } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      update: mockUpdate,
    },
  }),
}));

function stripeSubResponse(currentPeriodEndISO: string) {
  return {
    items: {
      data: [{ current_period_end: Math.floor(new Date(currentPeriodEndISO).getTime() / 1000) }],
    },
  };
}

describe("cancelSubscription", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it("sets cancel_at_period_end and returns the period-end date", async () => {
    mockUpdate.mockResolvedValue(stripeSubResponse("2026-09-10T00:00:00Z"));

    const result = await cancelSubscription("sub_test");

    expect(mockUpdate).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: true,
      expand: ["items"],
    });
    expect(result.periodEnd.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });
});
