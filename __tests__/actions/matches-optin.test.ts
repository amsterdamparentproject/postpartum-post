/**
 * optInFromMatches — unit tests
 *
 * In-app equivalent of the emailed opt-in link (GET /api/optin), reachable
 * from /matches. Same coffee/playdate/skip semantics, plus:
 *   - a hard deadline (closes after the 5th of the month)
 *   - an explicit "already responded" guard (no silent overwrite of a prior
 *     choice, unlike the route's upsert-on-topic-change behavior)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { optInFromMatches } from "@/app/(account)/matches/actions";

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

function stripeMonthlySubResponse() {
  return {
    items: {
      data: [
        {
          price: { lookup_key: "standard_monthly" },
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      ],
    },
  };
}

// Fixed "now" within the opt-in window (3rd of the month) and outside it
// (10th), keeping year/month otherwise identical so currentMonth() /
// monthToDate() stay in sync with the faked clock.
const BEFORE_DEADLINE = new Date("2026-07-03T12:00:00.000Z");
const AFTER_DEADLINE = new Date("2026-07-10T12:00:00.000Z");

describe("optInFromMatches", () => {
  let memberId: string;
  let monthDate: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_DEADLINE);
    monthDate = monthToDate(currentMonth());
    mockRetrieve.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (memberId) {
      await cleanupMember(memberId);
      memberId = "";
    }
  });

  // ---------------------------------------------------------------------------
  // Deadline
  // ---------------------------------------------------------------------------

  it("after the 5th — returns 'closed' and makes no DB writes", async () => {
    const member = await seedMember();
    memberId = member.id;
    vi.setSystemTime(AFTER_DEADLINE);

    const result = await optInFromMatches(memberId, "coffee");
    expect(result).toEqual({ success: false, error: "closed" });

    const supabase = createTestSupabase();
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .maybeSingle();
    expect(participation).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Coffee
  // ---------------------------------------------------------------------------

  it("coffee — records monthly_participation with coffee topic and resets consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;

    const result = await optInFromMatches(memberId, "coffee");
    expect(result).toEqual({ success: true });

    const supabase = createTestSupabase();
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("topic_id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    expect(participation).not.toBeNull();

    const { data: topic } = await supabase
      .from("topics")
      .select("name")
      .eq("id", participation!.topic_id)
      .single();
    expect(topic?.name).toBe("coffee");

    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Playdate
  // ---------------------------------------------------------------------------

  it("playdate — records monthly_participation with playdate topic and resets consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 2 });
    memberId = member.id;

    const result = await optInFromMatches(memberId, "playdate");
    expect(result).toEqual({ success: true });

    const supabase = createTestSupabase();
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("topic_id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    expect(participation).not.toBeNull();

    const { data: topic } = await supabase
      .from("topics")
      .select("name")
      .eq("id", participation!.topic_id)
      .single();
    expect(topic?.name).toBe("playdate");

    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Skip
  // ---------------------------------------------------------------------------

  it("skip — records monthly_skips, increments consecutive_skips, and extends the Stripe subscription", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    const result = await optInFromMatches(memberId, "skip");
    expect(result).toEqual({ success: true });

    const supabase = createTestSupabase();
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    expect(skip).not.toBeNull();

    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(1);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trial_end: expect.any(Number),
        proration_behavior: "none",
      })
    );
  });

  it("skip with no active subscription — still records the skip, never calls Stripe", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    // No seedSubscription() — member has no subscription row

    const result = await optInFromMatches(memberId, "skip");
    expect(result).toEqual({ success: true });
    expect(mockUpdate).not.toHaveBeenCalled();

    const supabase = createTestSupabase();
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    expect(skip).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Already responded — no silent overwrite
  // ---------------------------------------------------------------------------

  it("already opted in — a second opt-in call is rejected and does not change the topic", async () => {
    const member = await seedMember();
    memberId = member.id;

    await optInFromMatches(memberId, "coffee");
    const second = await optInFromMatches(memberId, "playdate");
    expect(second).toEqual({ success: false, error: "already_responded" });

    const supabase = createTestSupabase();
    const { data: rows } = await supabase
      .from("monthly_participation")
      .select("topic_id")
      .eq("member_id", memberId)
      .eq("month", monthDate);
    expect(rows).toHaveLength(1);

    const { data: topic } = await supabase
      .from("topics")
      .select("name")
      .eq("id", rows![0].topic_id)
      .single();
    expect(topic?.name).toBe("coffee");
  });

  it("already skipped — a coffee/playdate call afterward is rejected, consecutive_skips unchanged", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    await optInFromMatches(memberId, "skip");
    const attempt = await optInFromMatches(memberId, "coffee");
    expect(attempt).toEqual({ success: false, error: "already_responded" });

    const supabase = createTestSupabase();
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    expect(participation).toBeNull();

    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(2);
  });

  it("already opted in — a skip call afterward is rejected and does not touch Stripe", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);

    await optInFromMatches(memberId, "playdate");
    const attempt = await optInFromMatches(memberId, "skip");
    expect(attempt).toEqual({ success: false, error: "already_responded" });
    expect(mockUpdate).not.toHaveBeenCalled();

    const supabase = createTestSupabase();
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    expect(skip).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Unknown member
  // ---------------------------------------------------------------------------

  it("unknown member — returns 'server_error' and makes no writes", async () => {
    const result = await optInFromMatches(crypto.randomUUID(), "coffee");
    expect(result).toEqual({ success: false, error: "server_error" });
  });
});
