/**
 * getMatchStatus — unit tests
 *
 * Focuses on rematch_requested_by threading:
 *   - rematchRequestedBy is correctly mapped from the DB field
 *   - isRequester can be correctly derived for both parties
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/match-token", () => ({
  generateMatchToken: () => "mock-token",
}));
vi.mock("@/lib/skip-token", () => ({
  currentMonth: () => "2026-06",
  monthToDate: () => "2026-06-01",
}));

const MEMBER_A = "aaaaaaaa-0000-0000-0000-000000000000";
const MEMBER_B = "bbbbbbbb-0000-0000-0000-000000000000";
const MATCH_ID = "match-0000-0000-0000-000000000000";

const BASE_MATCH = {
  id: MATCH_ID,
  matched_on: "2026-06-01",
  rematch_requested: true,
  rematch_requested_by: MEMBER_A,
  member_id_1: MEMBER_A,
  member_id_2: MEMBER_B,
  member1: { id: MEMBER_A, first_name: "Alex", last_name: "A", email: "a@test.com" },
  member2: { id: MEMBER_B, first_name: "Beth", last_name: "B", email: "b@test.com" },
};

function mockSupabase(matchRow = BASE_MATCH) {
  return {
    createAdminClient: () => ({
      from: (table: string) => {
        if (table === "matches") {
          return {
            select: () => ({
              or: () => ({
                order: () => Promise.resolve({ data: [matchRow], error: null }),
              }),
            }),
          };
        }
        if (table === "monthly_participation") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      },
    }),
  };
}

describe("getMatchStatus — rematchRequestedBy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sets rematchRequestedBy to the requesting member's ID", async () => {
    vi.doMock("@/lib/supabase", () => mockSupabase());
    const { getMatchStatus } = await import("@/app/(account)/matches/actions");

    const status = await getMatchStatus(MEMBER_A);
    expect(status.type).toBe("matched");
    if (status.type !== "matched") return;

    const match = status.matches[0];
    expect(match.rematchRequestedBy).toBe(MEMBER_A);
  });

  it("requester: rematchRequestedBy equals their own memberId", async () => {
    vi.doMock("@/lib/supabase", () => mockSupabase());
    const { getMatchStatus } = await import("@/app/(account)/matches/actions");

    const status = await getMatchStatus(MEMBER_A);
    if (status.type !== "matched") return;

    const match = status.matches[0];
    // The component derives isRequester = rematchRequestedBy === memberId
    expect(match.rematchRequestedBy).toBe(MEMBER_A);
  });

  it("other party: rematchRequestedBy does not equal their memberId", async () => {
    vi.doMock("@/lib/supabase", () => mockSupabase());
    const { getMatchStatus } = await import("@/app/(account)/matches/actions");

    // Fetch from MEMBER_B's perspective — they are NOT the requester
    const status = await getMatchStatus(MEMBER_B);
    if (status.type !== "matched") return;

    const match = status.matches[0];
    expect(match.rematchRequestedBy).toBe(MEMBER_A);
    expect(match.rematchRequestedBy).not.toBe(MEMBER_B);
  });

  it("returns null rematchRequestedBy when no rematch has been requested", async () => {
    const noRematchRow = { ...BASE_MATCH, rematch_requested: false, rematch_requested_by: null };
    vi.doMock("@/lib/supabase", () => mockSupabase(noRematchRow));
    const { getMatchStatus } = await import("@/app/(account)/matches/actions");

    const status = await getMatchStatus(MEMBER_A);
    if (status.type !== "matched") return;

    expect(status.matches[0].rematchRequestedBy).toBeNull();
  });
});
