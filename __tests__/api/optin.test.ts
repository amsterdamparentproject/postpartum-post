import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { generateOptinToken } from "@/lib/optin-token";
import { GET } from "@/app/api/optin/route";

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

const MONTH = "2024-03";
const MONTH_DATE = "2024-03-01";
const BASE_URL = "http://localhost";

// The optin route now redirects through a Supabase magic link. Extract the
// final destination from the redirect_to query param when present.
function getRedirectTarget(location: string | null): string {
  if (!location) return "";
  try {
    const redirectTo = new URL(location).searchParams.get("redirect_to");
    return redirectTo ?? location;
  } catch {
    return location;
  }
}

function makeRequest(memberId: string, month: string, action: string, token: string) {
  const url = `${BASE_URL}/api/optin?member=${memberId}&month=${month}&action=${action}&token=${token}`;
  return new NextRequest(url, { method: "GET" });
}

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

describe("GET /api/optin", () => {
  let memberId: string;

  beforeEach(() => {
    mockRetrieve.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) {
      await cleanupMember(memberId);
      memberId = "";
    }
  });

  // ---------------------------------------------------------------------------
  // Coffee opt-in
  // ---------------------------------------------------------------------------

  it("coffee — records a monthly_participation row with coffee topic and resets consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;

    const token = generateOptinToken(memberId, MONTH, "coffee");
    const res = await GET(makeRequest(memberId, MONTH, "coffee", token));

    expect(res.status).toBe(307);
    expect(getRedirectTarget(res.headers.get("location"))).toContain("/profile?optin=coffee");

    const supabase = createTestSupabase();

    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("member_id, month, topic_id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(participation).not.toBeNull();

    // Confirm topic is coffee
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
  // Playdate opt-in
  // ---------------------------------------------------------------------------

  it("playdate — records a monthly_participation row with playdate topic and resets consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 2 });
    memberId = member.id;

    const token = generateOptinToken(memberId, MONTH, "playdate");
    const res = await GET(makeRequest(memberId, MONTH, "playdate", token));

    expect(res.status).toBe(307);
    expect(getRedirectTarget(res.headers.get("location"))).toContain("/profile?optin=playdate");

    const supabase = createTestSupabase();

    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("topic_id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
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
  // Upsert — changing topic choice
  // ---------------------------------------------------------------------------

  it("upsert — clicking playdate after coffee updates the topic, does not create a duplicate row", async () => {
    const member = await seedMember();
    memberId = member.id;

    // First click: coffee
    const coffeeToken = generateOptinToken(memberId, MONTH, "coffee");
    await GET(makeRequest(memberId, MONTH, "coffee", coffeeToken));

    // Second click: playdate
    const playdateToken = generateOptinToken(memberId, MONTH, "playdate");
    await GET(makeRequest(memberId, MONTH, "playdate", playdateToken));

    const supabase = createTestSupabase();

    const { data: rows } = await supabase
      .from("monthly_participation")
      .select("topic_id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE);

    // Exactly one row
    expect(rows).toHaveLength(1);

    // Topic updated to playdate
    const { data: topic } = await supabase
      .from("topics")
      .select("name")
      .eq("id", rows![0].topic_id)
      .single();
    expect(topic?.name).toBe("playdate");
  });

  // ---------------------------------------------------------------------------
  // Skip
  // ---------------------------------------------------------------------------

  it("skip — records a monthly_skip row, increments consecutive_skips, and calls Stripe to extend subscription", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    const token = generateOptinToken(memberId, MONTH, "skip");
    const res = await GET(makeRequest(memberId, MONTH, "skip", token));

    expect(res.status).toBe(307);
    expect(getRedirectTarget(res.headers.get("location"))).toContain("/billing?optin=skip");

    const supabase = createTestSupabase();

    // monthly_skips row written
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(skip).not.toBeNull();

    // consecutive_skips incremented
    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(1);

    // Stripe subscription extended by one month via trial_end
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trial_end: expect.any(Number),
        proration_behavior: "none",
      })
    );
  });

  it("skip (already skipped) — redirects to /optin/already and does not double-write or re-extend Stripe", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    const token = generateOptinToken(memberId, MONTH, "skip");
    await GET(makeRequest(memberId, MONTH, "skip", token));
    mockUpdate.mockClear();

    // Second skip attempt
    const res = await GET(makeRequest(memberId, MONTH, "skip", token));

    expect(getRedirectTarget(res.headers.get("location"))).toContain("/billing?optin=already_skip");
    expect(mockUpdate).not.toHaveBeenCalled();

    const supabase = createTestSupabase();
    const { data: rows } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE);
    expect(rows).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // No response
  // ---------------------------------------------------------------------------

  it("no response — member has no participation or skip row, is excluded from the match pool, and subscription is unchanged", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);

    // No action taken — member simply doesn't click anything

    const supabase = createTestSupabase();

    // No participation row
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(participation).toBeNull();

    // No skip row
    const { data: skip } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(skip).toBeNull();

    // Excluded from the match pool (as run-matcher queries it)
    const { data: pool } = await supabase
      .from("monthly_participation")
      .select("member_id")
      .eq("month", MONTH_DATE)
      .eq("member_id", memberId);
    expect(pool).toHaveLength(0);

    // Stripe never touched
    expect(mockUpdate).not.toHaveBeenCalled();

    // consecutive_skips unchanged
    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Invalid / tampered token
  // ---------------------------------------------------------------------------

  it("invalid token — redirects to home and makes no DB writes", async () => {
    const member = await seedMember();
    memberId = member.id;

    const res = await GET(makeRequest(memberId, MONTH, "coffee", "not-a-valid-token"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);

    const supabase = createTestSupabase();
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(participation).toBeNull();
  });

  it("token for wrong action — coffee token cannot be used to trigger playdate", async () => {
    const member = await seedMember();
    memberId = member.id;

    // Generate a coffee token but use it for playdate
    const coffeeToken = generateOptinToken(memberId, MONTH, "coffee");
    const res = await GET(makeRequest(memberId, MONTH, "playdate", coffeeToken));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);

    const supabase = createTestSupabase();
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(participation).toBeNull();
  });
});
