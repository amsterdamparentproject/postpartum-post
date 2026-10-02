import { describe, it, expect, vi, beforeEach } from "vitest";
import { pauseSubscriptionCollection } from "@/lib/subscription-utils";

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

describe("pauseSubscriptionCollection", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it("pauses collection (void) and never schedules a cancellation", async () => {
    mockUpdate.mockResolvedValue({});

    await pauseSubscriptionCollection("sub_test");

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith("sub_test", {
      pause_collection: { behavior: "void" },
    });
  });
});
