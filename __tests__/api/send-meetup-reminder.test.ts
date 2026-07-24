/**
 * Integration tests for POST /api/send-meetup-reminder
 *
 * Focuses on match eligibility: a match should still get the reminder when
 * a member's status is 'canceling' (they keep access through period end —
 * this was a real bug: they were previously excluded like 'paused'/'inactive'
 * members), but should be skipped when a member is genuinely ineligible, a
 * rematch was requested, or the match is flagged for review.
 *
 * sendMeetupReminderEmail is mocked so no real emails are sent. generateLink
 * (for the feedback magic link) is NOT mocked — it runs for real against the
 * test Supabase project, same as send-match-emails.test.ts does for its own
 * magic links.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/send-meetup-reminder/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/emails", () => ({ sendMeetupReminderEmail: mockSend }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost";
// Distinct from every other test file's sentinel month (2099-01 commit-matches,
// 2099-02 lock-matches, 2099-04 send-match-emails) — this route's query isn't
// scoped to a round/match id, it pulls every matches row for the date.
const TEST_MONTH = "2099-05";
const TEST_MONTH_DATE = "2099-05-01";

function makeRequest(body: Record<string, unknown> = {}) {
  const secret = process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/send-meetup-reminder`, {
    method: "POST",
    body: JSON.stringify({ month: TEST_MONTH, ...body }),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
  });
}

async function seedMatch(
  member1Id: string,
  member2Id: string,
  overrides: Partial<{ rematch_requested: boolean; flagged_for_review: boolean }> = {},
): Promise<string> {
  const supabase = createTestSupabase();
  const matchId = crypto.randomUUID();
  const { error } = await supabase.from("matches").insert({
    id: matchId,
    member_id_1: member1Id,
    member_id_2: member2Id,
    matched_on: TEST_MONTH_DATE,
    rematch_requested: overrides.rematch_requested ?? false,
    flagged_for_review: overrides.flagged_for_review ?? false,
  });
  if (error) throw new Error(`seedMatch failed: ${error.message}`);
  return matchId;
}

async function cleanup(memberIds: string[]) {
  for (const id of memberIds) {
    await cleanupMember(id);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/send-meetup-reminder — match eligibility", () => {
  afterEach(() => {
    mockSend.mockClear();
  });

  it("sends to both members of an eligible (active/active) match", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Active", status: "active" });
    const b = await seedMember({ first_name: "Bob", last_name: "Active", status: "active" });

    try {
      await seedMatch(a.id, b.id);

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(mockSend).toHaveBeenCalledTimes(2);
      const recipients = mockSend.mock.calls.map((call) => call[0]);
      expect(recipients).toEqual(expect.arrayContaining([a.email, b.email]));
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("still sends when a member's status is canceling (regression)", async () => {
    const a = await seedMember({ first_name: "Ernesto", last_name: "Active", status: "active" });
    const b = await seedMember({ first_name: "Miguel", last_name: "Canceling", status: "canceling" });

    try {
      await seedMatch(a.id, b.id);

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(mockSend).toHaveBeenCalledTimes(2);
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("skips when a member is paused", async () => {
    const a = await seedMember({ first_name: "Carla", last_name: "Active", status: "active" });
    const b = await seedMember({ first_name: "Dana", last_name: "Paused", status: "paused" });

    try {
      await seedMatch(a.id, b.id);

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(mockSend).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.skipped).toBe(1);
      expect(body.sent).toBe(0);
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("skips when a rematch was requested", async () => {
    const a = await seedMember({ first_name: "Ella", last_name: "Active", status: "active" });
    const b = await seedMember({ first_name: "Finn", last_name: "Active", status: "active" });

    try {
      await seedMatch(a.id, b.id, { rematch_requested: true });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      // Filtered at the query level (rematch_requested=false), so it never
      // shows up as a row at all — not counted as skipped, just absent.
      expect(mockSend).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.totalMatches).toBe(0);
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("skips when the match is flagged for review", async () => {
    const a = await seedMember({ first_name: "Grace", last_name: "Active", status: "active" });
    const b = await seedMember({ first_name: "Henry", last_name: "Active", status: "active" });

    try {
      await seedMatch(a.id, b.id, { flagged_for_review: true });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(mockSend).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.totalMatches).toBe(0);
    } finally {
      await cleanup([a.id, b.id]);
    }
  });
});
