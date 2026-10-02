import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { unsubscribe, cancelPausedMembership, resumeMatching } from "@/app/actions/unsubscribe";

// --- Mocks ---

const { mockUpdate, mockCancel, mockSendCancellationConfirmedEmail } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockCancel: vi.fn(),
  mockSendCancellationConfirmedEmail: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      update: mockUpdate,
      cancel: mockCancel,
    },
  }),
}));

// Prevent NEXT_REDIRECT from throwing and interrupting assertions
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// The "token" passed to an action IS the member id in these tests;
// requireMember's real token→member verification is covered in profile.test.ts.
vi.mock("@/lib/require-member", () => ({
  requireMember: (token: string) =>
    Promise.resolve(token ? { memberId: token, email: `${token}@test.com` } : null),
}));

vi.mock("@/lib/emails", () => ({
  sendCancellationConfirmedEmail: mockSendCancellationConfirmedEmail,
}));

// unsubscribe() only pauses collection in Stripe (never schedules a cancel),
// so the mocked update() just needs to resolve.
function stripeCancelResponse() {
  return {};
}

// --- Integration test ---
// Verifies that calling unsubscribe() makes the correct DB writes.

describe("unsubscribe — integration", () => {
  let memberId: string;

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue(stripeCancelResponse());
    mockSendCancellationConfirmedEmail.mockReset();
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
// flow end-to-end: Stripe is only asked to pause collection (never to cancel),
// and the member transitions to 'canceling' while the subscription row stays
// active.

describe("unsubscribe — E2E", () => {
  let memberId: string;

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue(stripeCancelResponse());
    mockSendCancellationConfirmedEmail.mockReset();
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("pauses collection in Stripe (no cancel_at_period_end) and sets member to 'canceling'", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    const sub = await seedSubscription(memberId, {
      stripe_subscription_id: `sub_e2e_${memberId.slice(0, 8)}`,
      status: "active",
    });

    await unsubscribe(memberId);

    // Stripe is asked to pause collection only. No cancel_at_period_end:
    // Stripe must never end a member's access on its own date, or matches
    // they paid for would be lost. renew-check cancels at zero instead.
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith(
      sub.stripe_subscription_id,
      { pause_collection: { behavior: "void" } }
    );

    const supabase = createTestSupabase();

    // Subscription stays active until renew-check cancels it at zero
    const { data: updatedSub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("member_id", memberId)
      .single();
    expect(updatedSub?.status).toBe("active");

    // Member is canceling, not inactive — they keep their remaining matches
    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("canceling");
  });

  it("sends the immediate cancellation confirmation email with the matches they have left", async () => {
    const member = await seedMember({
      status: "active",
      email: "cancel-test@example.com",
      first_name: "Robin",
      matches_remaining: 2,
    });
    memberId = member.id;
    await seedSubscription(memberId, {
      stripe_subscription_id: `sub_email_${memberId.slice(0, 8)}`,
      status: "active",
    });

    await unsubscribe(memberId);

    expect(mockSendCancellationConfirmedEmail).toHaveBeenCalledOnce();
    expect(mockSendCancellationConfirmedEmail).toHaveBeenCalledWith(
      "cancel-test@example.com",
      "Robin",
      2
    );
  });
});

// --- Paused members ---

describe("paused members", () => {
  let memberId: string;

  beforeEach(() => {
    mockUpdate.mockReset();
    mockCancel.mockReset();
    mockCancel.mockResolvedValue({});
    mockSendCancellationConfirmedEmail.mockReset();
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  async function statusOf(id: string) {
    const { data } = await createTestSupabase().from("members").select("status").eq("id", id).single();
    return data?.status;
  }

  it("unsubscribe() refuses a paused member (they must not re-enter rounds as 'canceling')", async () => {
    const member = await seedMember({ status: "paused" });
    memberId = member.id;
    await seedSubscription(memberId);

    await expect(unsubscribe(memberId)).rejects.toThrow(/paused/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(await statusOf(memberId)).toBe("paused");
  });

  it("cancelPausedMembership ends access now: cancels in Stripe, sets inactive, sends confirmation", async () => {
    const member = await seedMember({ status: "paused", matches_remaining: 2 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });

    await cancelPausedMembership(memberId);

    expect(mockCancel).toHaveBeenCalledWith(sub.stripe_subscription_id, { invoice_now: false, prorate: false });
    expect(await statusOf(memberId)).toBe("inactive");
    expect(mockSendCancellationConfirmedEmail).toHaveBeenCalledWith(member.email, expect.any(String), 0);
  });

  it("cancelPausedMembership restores 'paused' if Stripe fails", async () => {
    const member = await seedMember({ status: "paused" });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });
    mockCancel.mockRejectedValue(new Error("stripe down"));

    await expect(cancelPausedMembership(memberId)).rejects.toThrow("stripe down");
    expect(await statusOf(memberId)).toBe("paused");
  });

  it("cancelPausedMembership rejects a member who isn't paused", async () => {
    const member = await seedMember({ status: "active" });
    memberId = member.id;
    await expect(cancelPausedMembership(memberId)).rejects.toThrow("not paused");
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("resumeMatching reactivates a paused member with matches left and resets skips", async () => {
    const member = await seedMember({ status: "paused", matches_remaining: 2, consecutive_skips: 3 });
    memberId = member.id;

    expect(await resumeMatching(memberId)).toEqual({ status: "ok" });
    const { data } = await createTestSupabase()
      .from("members").select("status, consecutive_skips").eq("id", memberId).single();
    expect(data).toEqual({ status: "active", consecutive_skips: 0 });
    expect(mockUpdate).not.toHaveBeenCalled(); // Stripe stays paused
  });

  it("resumeMatching leaves a paused member with no matches left alone (support handles it)", async () => {
    const member = await seedMember({ status: "paused", matches_remaining: 0 });
    memberId = member.id;
    expect(await resumeMatching(memberId)).toEqual({ status: "no_matches_left" });
    expect(await statusOf(memberId)).toBe("paused");
  });

  it("resumeMatching ignores members who aren't paused", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 2 });
    memberId = member.id;
    expect(await resumeMatching(memberId)).toEqual({ status: "not_paused" });
    expect(await statusOf(memberId)).toBe("canceling");
  });
});

describe("auth", () => {
  it("rejects calls without a valid session", async () => {
    await expect(unsubscribe("")).rejects.toThrow("Not authenticated");
    await expect(cancelPausedMembership("")).rejects.toThrow("Not authenticated");
    expect(await resumeMatching("")).toEqual({ status: "unauthenticated" });
  });
});
