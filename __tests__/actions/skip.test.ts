import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { generateSkipToken } from "@/lib/skip-token";
import { recordSkip } from "@/app/actions/skip";

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

vi.mock("@/lib/emails", () => ({
  sendAutoPauseEmail: vi.fn(),
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

function stripeSixMonthSubResponse() {
  return {
    items: {
      data: [
        {
          price: { lookup_key: "commitment_6mo" },
          current_period_end: Math.floor(Date.now() / 1000) + 150 * 86400,
        },
      ],
    },
  };
}

const MONTH = "2025-06";

describe("recordSkip", () => {
  let memberId: string;

  beforeEach(() => {
    mockRetrieve.mockReset();
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
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

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

  it("calls Stripe pause_collection for a monthly plan", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        pause_collection: expect.objectContaining({ behavior: "void" }),
      })
    );
  });

  it("calls Stripe trial_end extension for a 6-month plan", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_6mo" });
    mockRetrieve.mockResolvedValue(stripeSixMonthSubResponse());

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trial_end: expect.any(Number),
        proration_behavior: "none",
      })
    );
  });

  it("returns already_skipped and does not double-increment consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

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

  it("auto-pauses a monthly member after 3 consecutive skips", async () => {
    const member = await seedMember({ consecutive_skips: 2 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

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

  it("does not auto-pause a 6-month member after 3 consecutive skips", async () => {
    const member = await seedMember({ consecutive_skips: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_6mo" });
    mockRetrieve.mockResolvedValue(stripeSixMonthSubResponse());

    const token = generateSkipToken(memberId, MONTH);
    await recordSkip(memberId, MONTH, token);

    const supabase = createTestSupabase();
    const { data: updated } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updated?.status).toBe("active");
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
