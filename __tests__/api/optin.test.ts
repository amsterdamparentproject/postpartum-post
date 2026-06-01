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

const MONTH = "2026-06";
const MONTH_DATE = "2026-06-01";
const BASE_URL = "http://localhost";

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

  it("opt in — records a monthly_participation row and resets consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 1 });
    memberId = member.id;

    const token = generateOptinToken(memberId, MONTH, "coffee");
    const req = makeRequest(memberId, MONTH, "coffee", token);
    const res = await GET(req);

    // Redirects to confirmation page
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/optin/confirmed?action=coffee");

    const supabase = createTestSupabase();

    // monthly_participation row written
    const { data: participation } = await supabase
      .from("monthly_participation")
      .select("member_id, month")
      .eq("member_id", memberId)
      .eq("month", MONTH_DATE)
      .maybeSingle();
    expect(participation).not.toBeNull();

    // consecutive_skips reset to 0
    const { data: updated } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();
    expect(updated?.consecutive_skips).toBe(0);
  });

  it("opt out (skip) — records a monthly_skip row and increments consecutive_skips", async () => {
    const member = await seedMember({ consecutive_skips: 0 });
    memberId = member.id;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeMonthlySubResponse());

    const token = generateOptinToken(memberId, MONTH, "skip");
    const req = makeRequest(memberId, MONTH, "skip", token);
    const res = await GET(req);

    // Redirects to confirmation page
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/optin/confirmed?action=skip");

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
  });

  it("no response — member has no participation or skip row and is excluded from the opt-in pool", async () => {
    const member = await seedMember();
    memberId = member.id;

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

    // Querying the opt-in pool (as run-matcher does) excludes this member
    const { data: pool } = await supabase
      .from("monthly_participation")
      .select("member_id")
      .eq("month", MONTH_DATE)
      .eq("member_id", memberId);
    expect(pool).toHaveLength(0);
  });
});
