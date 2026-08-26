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
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/send-match-emails/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSend, mockRetrieve } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue(undefined),
  mockRetrieve: vi.fn(),
}));

vi.mock("@/lib/emails", () => ({ sendMatchRevealEmail: mockSend }));

// Track C4: fetchBillingNoticeContext (lib/billing-notice.ts) does a live
// Stripe subscriptions.retrieve for any member with a subscription row —
// mocked the same way __tests__/lib/billing-notice.test.ts does it, so
// these tests don't need real Stripe access.
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ subscriptions: { retrieve: mockRetrieve } }),
}));

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

describe("POST /api/send-match-emails — billing notice (Track C4)", () => {
  afterEach(() => {
    mockSend.mockClear();
    mockRetrieve.mockClear();
  });

  // billingNotice is the 11th positional arg (index 10) — appended after
  // the pre-existing 10 params so index 5 (topic, asserted on above) never
  // moves. See lib/emails/match-reveal.ts.
  function noticeFor(email: string): unknown {
    return mockSend.mock.calls.find((call) => call[0] === email)?.[10];
  }

  it("gives a comped (FYP) member no notice at all, ignoring their counter", async () => {
    const comped = await seedMember({ first_name: "Comp", last_name: "Member" });
    const other = await seedMember({ first_name: "Regular", last_name: "Member" });
    await seedSubscription(comped.id, { status: "active" });
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { lookup_key: "fyp_monthly_single", recurring: { interval_count: 1 } } }] },
    });

    try {
      await seedCommittedRound();
      await seedMatch(comped.id, other.id);
      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);
      expect(noticeFor(comped.email)).toEqual({ kind: "none" });
    } finally {
      await cleanup([comped.id, other.id]);
    }
  });

  it("gives a bundle member with matches left the counter tier", async () => {
    const a = await seedMember();
    const b = await seedMember();
    await seedSubscription(a.id, { status: "active" });
    await createTestSupabase().from("members").update({ matches_remaining: 2 }).eq("id", a.id);
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { lookup_key: "commitment_3mo", recurring: { interval_count: 3 } } }] },
    });

    try {
      await seedCommittedRound();
      await seedMatch(a.id, b.id);
      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);
      expect(noticeFor(a.email)).toEqual({ kind: "counter", matchesRemaining: 2 });
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("gives a bundle member whose counter hit zero the loud tier", async () => {
    const a = await seedMember();
    const b = await seedMember();
    await seedSubscription(a.id, { status: "active" });
    await createTestSupabase().from("members").update({ matches_remaining: 0 }).eq("id", a.id);
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { lookup_key: "commitment_3mo", recurring: { interval_count: 3 } } }] },
    });

    try {
      await seedCommittedRound();
      await seedMatch(a.id, b.id);
      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);
      const notice = noticeFor(a.email) as { kind: string; isFirstAfterGift?: boolean };
      expect(notice.kind).toBe("loud");
      expect(notice.isFirstAfterGift).toBe(false);
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("gives a monthly member the quiet tier regardless of counter", async () => {
    const a = await seedMember();
    const b = await seedMember();
    await seedSubscription(a.id, { status: "active" });
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { lookup_key: "standard_monthly", recurring: { interval_count: 1 } } }] },
    });

    try {
      await seedCommittedRound();
      await seedMatch(a.id, b.id);
      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);
      expect((noticeFor(a.email) as { kind: string }).kind).toBe("quiet");
    } finally {
      await cleanup([a.id, b.id]);
    }
  });

  it("gives a member with no subscription row no notice, rather than guessing", async () => {
    const a = await seedMember(); // no seedSubscription call
    const b = await seedMember();

    try {
      await seedCommittedRound();
      await seedMatch(a.id, b.id);
      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);
      expect(noticeFor(a.email)).toEqual({ kind: "none" });
      expect(mockRetrieve).not.toHaveBeenCalled();
    } finally {
      await cleanup([a.id, b.id]);
    }
  });
});
