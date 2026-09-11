import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { generateSkipToken } from "@/lib/tokens";
import { recordSkip } from "@/app/actions/skip";

// --- Mocks ---
//
// Track F: recordSkip itself no longer touches Stripe at all — a skip is
// pure DB bookkeeping (monthly_skips row + consecutive_skips counter).
// The only Stripe call left in this file is autoPauseMember's indefinite
// pause_collection once a member crosses the auto-pause threshold, so
// mockUpdate is all that's needed (no mockRetrieve — nothing here reads a
// subscription's price or plan type anymore; the auto-pause threshold is
// plan-blind).

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

vi.mock("@/lib/emails", () => ({
  sendAutoPauseEmail: vi.fn(),
}));

const MONTH = "2025-06";

describe("recordSkip", () => {
  let memberId: string;

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("records a skip row and increments consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);

    const token = generateSkipToken(memberId, MONTH);
    const result = await recordSkip(memberId, MONTH, token);

    expect(result.status).toBe("ok");

    const supabase = createTestSupabase();
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", `${MONTH}-01`)
      .single();
    expect(skip).not.toBeNull();

    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(1);
  });

  it("does not touch Stripe for an ordinary skip below the auto-pause threshold", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns already_skipped and does not double-increment consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;
    await seedSubscription(memberId);

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);
    const result = await recordSkip(memberId, MONTH, token);

    expect(result.status).toBe("already_skipped");

    const supabase = createTestSupabase();
    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(2);
  });

  it("auto-pauses after 3 consecutive skips", async () => {
    const member = await seedMember({ consecutive_skips: 2 });
    memberId = member.id;
    await seedSubscription(memberId);

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    const supabase = createTestSupabase();
    const { data: updated } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updated?.status).toBe("paused");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pause_collection: { behavior: "void" } })
    );
  });

  // Track F: auto-pause used to be gated to monthly plans only ("pausing
  // would forfeit their renewal" for a 3-month/bundle member, back when a
  // subscription's own billing date was the thing tracking what they were
  // owed). Now that matches_remaining is the counter and pausing never
  // forfeits anything, every plan auto-pauses the same way.
  it("auto-pauses a 3-month/bundle member after 3 consecutive skips too", async () => {
    const member = await seedMember({ consecutive_skips: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_6mo" });

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    const supabase = createTestSupabase();
    const { data: updated } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updated?.status).toBe("paused");
  });

  it("returns invalid_token and makes no DB writes for a bad token", async () => {
    const member = await seedMember();
    memberId = member.id;

    const result = await recordSkip(memberId, MONTH, "not-a-valid-token");

    expect(result.status).toBe("invalid_token");

    const supabase = createTestSupabase();
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .maybeSingle();
    expect(skip).toBeNull();
  });
});
