import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { unsubscribe } from "@/app/actions/unsubscribe";

// --- Mocks ---

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

// Prevent NEXT_REDIRECT from throwing and interrupting assertions
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// --- Integration test ---
// Verifies that calling unsubscribe() makes the correct DB writes.

describe("unsubscribe — integration", () => {
  let memberId: string;

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("sets member status to 'canceling' and leaves subscription active", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    const sub = await seedSubscription(memberId);

    await unsubscribe(memberId);

    const supabase = createTestSupabase();

    // Subscription row stays active — the webhook handles the transition when
    // the billing period actually expires.
    const { data: updatedSub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", sub.stripe_subscription_id)
      .single();
    expect(updatedSub?.status).toBe("active");

    // Member transitions to 'canceling', not 'inactive' — they still have access.
    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("canceling");
  });

  it("throws and makes no DB writes if no active subscription exists", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    // No subscription seeded

    await expect(unsubscribe(memberId)).rejects.toThrow("No active subscription found");

    expect(mockUpdate).not.toHaveBeenCalled();

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
// flow end-to-end: Stripe is called with cancel_at_period_end, and the member
// transitions to 'canceling' while the subscription row stays active.

describe("unsubscribe — E2E", () => {
  let memberId: string;

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("calls Stripe update with cancel_at_period_end and sets member to 'canceling'", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    const sub = await seedSubscription(memberId, {
      stripe_subscription_id: `sub_e2e_${memberId.slice(0, 8)}`,
      status: "active",
    });

    await unsubscribe(memberId);

    // Stripe received cancel_at_period_end — not an immediate cancel
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith(
      sub.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    const supabase = createTestSupabase();

    // Subscription stays active until Stripe fires the deleted event
    const { data: updatedSub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("member_id", memberId)
      .single();
    expect(updatedSub?.status).toBe("active");

    // Member is canceling, not inactive — they keep access until period ends
    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("canceling");
  });
});
