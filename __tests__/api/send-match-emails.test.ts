/**
 * Integration tests for POST /api/send-match-emails
 *
 * Focuses on topic resolution: the email should carry the shared topic
 * (coffee / playdate) only when both matched members opted into the same one.
 * If they differ — which shouldn't happen in a well-run match round but is
 * possible in edge cases — the topic falls back to null so the email renders
 * the generic "hang" copy instead of picking one member's preference.
 *
 * sendMatchRevealEmail is mocked so no real emails are sent.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/send-match-emails/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/emails", () => ({ sendMatchRevealEmail: mockSend }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost";
// Deliberately distinct from match-page.test.ts's sentinel date (2099-03-01).
// Both files seed real `matches` rows against the shared test DB, and this
// route's query (`matches.eq("matched_on", monthDate)`) isn't scoped to a
// specific round/match id — it pulls every row for that date, from any
// source. Vitest runs test files in parallel by default, so sharing a date
// let the two files' seeded matches collide when their runs overlapped,
// intermittently doubling the call count this test asserts on (flaky:
// caught locally as "expected 2 calls, got 4").
const TEST_MONTH = "2099-04";
const TEST_MONTH_DATE = "2099-04-01";

function makeRequest(body: Record<string, unknown> = {}) {
  const secret = process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/send-match-emails`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
  });
}

async function getTopicId(name: "coffee" | "playdate"): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("topics")
    .select("id")
    .eq("name", name)
    .single();
  if (error || !data) throw new Error(`Topic "${name}" not found`);
  return data.id as string;
}

async function seedCommittedRound(): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("match_rounds")
    .insert({ month: TEST_MONTH_DATE, status: "committed" })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`seedCommittedRound failed: ${error?.message}`);
  return data.id as string;
}

async function seedMatch(
  member1Id: string,
  member2Id: string,
): Promise<string> {
  const supabase = createTestSupabase();
  const matchId = crypto.randomUUID();
  const { error } = await supabase.from("matches").insert({
    id: matchId,
    member_id_1: member1Id,
    member_id_2: member2Id,
    matched_on: TEST_MONTH_DATE,
  });
  if (error) throw new Error(`seedMatch failed: ${error.message}`);
  return matchId;
}

async function seedParticipation(
  memberId: string,
  topicId: string,
): Promise<void> {
  const supabase = createTestSupabase();
  const { error } = await supabase.from("monthly_participation").insert({
    member_id: memberId,
    month: TEST_MONTH_DATE,
    topic_id: topicId,
  });
  if (error) throw new Error(`seedParticipation failed: ${error.message}`);
}

async function cleanup(memberIds: string[]) {
  const supabase = createTestSupabase();
  await supabase.from("match_rounds").delete().eq("month", TEST_MONTH_DATE);
  for (const id of memberIds) {
    await cleanupMember(id);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/send-match-emails — topic resolution", () => {
  let coffeeId: string;
  let playdateId: string;

  beforeAll(async () => {
    coffeeId = await getTopicId("coffee");
    playdateId = await getTopicId("playdate");
  });

  afterEach(() => {
    mockSend.mockClear();
  });

  it("passes null topic when members opted into different topics", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Conflict" });
    const b = await seedMember({ first_name: "Bob", last_name: "Conflict" });

    try {
      await seedCommittedRound();
      await seedMatch(a.id, b.id);
      await seedParticipation(a.id, coffeeId); // coffee
      await seedParticipation(b.id, playdateId); // playdate — conflict

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      // Both emails should carry null so the template uses the "hang" fallback
      expect(mockSend).toHaveBeenCalledTimes(2);
      for (const call of mockSend.mock.calls) {
        const topic = call[5]; // sendMatchRevealEmail(email, recipientFirst, matchFirst, matchLast, matchEmail, topic, ...)
        expect(topic).toBeNull();
      }
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("passes the shared topic when both members opted into the same topic", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Agree" });
    const b = await seedMember({ first_name: "Bob", last_name: "Agree" });

    try {
      await seedCommittedRound();
      await seedMatch(a.id, b.id);
      await seedParticipation(a.id, coffeeId);
      await seedParticipation(b.id, coffeeId);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(mockSend).toHaveBeenCalledTimes(2);
      for (const call of mockSend.mock.calls) {
        const topic = call[5];
        expect(topic).toBe("coffee");
      }
    } finally {
      await cleanup([a.id, b.id]);
    }
  });
});
