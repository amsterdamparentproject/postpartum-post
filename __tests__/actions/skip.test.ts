import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { generateSkipToken } from "@/lib/tokens";
import { recordSkip } from "@/app/actions/skip";

// --- Mocks ---
//
// Track F: recordSkip itself no longer touches Stripe at all — a skip is
// pure DB bookkeeping (monthly_skips row + consecutive_skips counter).
// There is no auto-pause any more, so no Stripe call happens at all;
// mockUpdate only exists to assert that.

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

  it("does not touch Stripe for a skip", async () => {
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

  it("does not pause or change status after 3 consecutive skips", async () => {
    const member = await seedMember({ status: "active", consecutive_skips: 2 });
    memberId = member.id;
    await seedSubscription(memberId);

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    const supabase = createTestSupabase();
    const { data: updated } = await supabase
      .from("members")
      .select("status, consecutive_skips")
      .eq("id", memberId)
      .single();
    // Streak is still counted (for analytics), but nothing pauses the member.
    expect(updated).toEqual({ status: "active", consecutive_skips: 3 });
    expect(mockUpdate).not.toHaveBeenCalled();
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
