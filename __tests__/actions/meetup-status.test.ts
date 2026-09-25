/**
 * setMeetupStatus + getMatchStatus meetupStatus mapping — unit tests
 *
 * "Did you meet up with <name>?" on the /matches card. Each member writes
 * only their own side of the match (met_up_status_1 for member_id_1,
 * met_up_status_2 for member_id_2, both defaulting to 'planning'), for current
 * and past matches but never rematch-requested ones. Supabase is mocked so
 * this runs without migration 026 applied to the test DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/match-token", () => ({ generateMatchToken: () => "mock-token" }));
vi.mock("@/lib/tokens", () => ({
  currentMonth: () => "2026-09",
  monthToDate: () => "2026-09-01",
}));
// The "token" passed to an action IS the member id in these unit tests.
vi.mock("@/lib/require-member", () => ({
  requireMember: (token: string) =>
    Promise.resolve(token ? { memberId: token, email: `${token}@test.com` } : null),
}));

const MEMBER_A = "aaaaaaaa-0000-0000-0000-000000000000";
const MEMBER_B = "bbbbbbbb-0000-0000-0000-000000000000";
const OUTSIDER = "cccccccc-0000-0000-0000-000000000000";
const MATCH_ID = "match-0000-0000-0000-000000000000";

type MatchRow = {
  id: string;
  matched_on: string;
  rematch_requested: boolean;
  rematch_requested_by: string | null;
  member_id_1: string;
  member_id_2: string;
  met_up_status_1: string;
  met_up_status_2: string;
  member1: { id: string; first_name: string; last_name: string; email: string };
  member2: { id: string; first_name: string; last_name: string; email: string };
};

const BASE_MATCH: MatchRow = {
  id: MATCH_ID,
  matched_on: "2026-09-01",
  rematch_requested: false,
  rematch_requested_by: null,
  member_id_1: MEMBER_A,
  member_id_2: MEMBER_B,
  met_up_status_1: "planning",
  met_up_status_2: "planning",
  member1: { id: MEMBER_A, first_name: "Alex", last_name: "A", email: "a@test.com" },
  member2: { id: MEMBER_B, first_name: "Beth", last_name: "B", email: "b@test.com" },
};

let matchRow: MatchRow | null;
let updates: Record<string, unknown>[];

vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "matches") {
        return {
          select: () => ({
            // setMeetupStatus: .eq("id", ...).maybeSingle()
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: matchRow, error: null }) }),
            // getMatchStatus: .or(...).order(...)
            or: () => ({ order: () => Promise.resolve({ data: matchRow ? [matchRow] : [], error: null }) }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => {
              updates.push(payload);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "monthly_participation") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    },
  }),
}));

import { setMeetupStatus, getMatchStatus } from "@/app/(account)/matches/actions";

beforeEach(() => {
  matchRow = { ...BASE_MATCH };
  updates = [];
});

describe("setMeetupStatus", () => {
  it("each member writes only their own side", async () => {
    await setMeetupStatus(MEMBER_A, MATCH_ID, "met");
    await setMeetupStatus(MEMBER_B, MATCH_ID, "not_met");
    expect(updates).toEqual([{ met_up_status_1: "met" }, { met_up_status_2: "not_met" }]);
  });

  it("refuses a match the member isn't part of", async () => {
    expect(await setMeetupStatus(OUTSIDER, MATCH_ID, "met")).toEqual({ success: false, error: "not_found" });
    expect(updates).toHaveLength(0);
  });

  it("allows past matches but refuses rematch-requested ones", async () => {
    matchRow = { ...BASE_MATCH, matched_on: "2026-08-01" };
    expect(await setMeetupStatus(MEMBER_A, MATCH_ID, "met")).toEqual({ success: true });
    matchRow = { ...BASE_MATCH, rematch_requested: true };
    expect(await setMeetupStatus(MEMBER_A, MATCH_ID, "met")).toEqual({ success: false, error: "rematch_requested" });
    expect(updates).toHaveLength(1);
  });
});

describe("getMatchStatus — meetupStatus", () => {
  it("returns each member's own side, never the partner's", async () => {
    matchRow = { ...BASE_MATCH, met_up_status_1: "met", met_up_status_2: "not_met" };
    const forA = await getMatchStatus(MEMBER_A);
    const forB = await getMatchStatus(MEMBER_B);
    if (forA.type !== "matched" || forB.type !== "matched") throw new Error("expected matched");
    expect(forA.matches[0].meetupStatus).toBe("met");
    expect(forB.matches[0].meetupStatus).toBe("not_met");
  });
});
