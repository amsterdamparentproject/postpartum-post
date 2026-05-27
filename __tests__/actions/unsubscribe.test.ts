import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { unsubscribe } from "@/app/actions/unsubscribe";

// --- Mocks ---

const { mockCancel } = vi.hoisted(() => ({
  mockCancel: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      cancel: mockCancel,
    },
  }),
}));

// Prevent NEXT_REDIRECT from throwing and interrupting assertions
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// --- Integration test ---
// Verifies that calling unsubscribe() makes the correct DB writes.

describe("unsubscribe — integration", () => {
  let memberId: string;

  beforeEach(() => {
    mockCancel.mockReset();
    mockCancel.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("sets subscription status to 'canceled' and member status to 'inactive'", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    const sub = await seedSubscription(memberId);

    await unsubscribe(memberId);

    const supabase = createTestSupabase();

    const { data: updatedSub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", sub.stripe_subscription_id)
      .single();
    expect(updatedSub?.status).toBe("canceled");

    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("inactive");
  });

  it("throws and makes no DB writes if no active subscription exists", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    // No subscription seeded

    await expect(unsubscribe(memberId)).rejects.toThrow("No active subscription found");

    expect(mockCancel).not.toHaveBeenCalled();

    // Member status should be unchanged
    const supabase = createTestSupabase();
    const { data } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(data?.status).toBe("active");
  });
});

// --- E2E-style test ---
// Seeds a complete member + subscription scenario and verifies the full cancel
// flow end-to-end: Stripe is called with the correct ID, and both DB tables
// reflect the canceled state.

describe("unsubscribe — E2E", () => {
  let memberId: string;

  beforeEach(() => {
    mockCancel.mockReset();
    mockCancel.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("calls Stripe cancel with the correct subscription ID and updates both DB tables", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    const sub = await seedSubscription(memberId, {
      stripe_subscription_id: `sub_e2e_${memberId.slice(0, 8)}`,
      status: "active",
    });

    await unsubscribe(memberId);

    // Stripe received the right subscription ID
    expect(mockCancel).toHaveBeenCalledOnce();
    expect(mockCancel).toHaveBeenCalledWith(sub.stripe_subscription_id);

    const supabase = createTestSupabase();

    // Subscription row is canceled
    const { data: updatedSub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("member_id", memberId)
      .single();
    expect(updatedSub?.status).toBe("canceled");

    // Member is inactive
    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("inactive");
  });
});
