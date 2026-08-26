/**
 * Integration tests for POST /api/commit-matches
 *
 * Tests cover:
 *   - Auth enforcement
 *   - Happy path: drafts promoted to matches, round marked 'committed'
 *   - Idempotency guard: already-committed round returns 409
 *   - No draft round for the month returns 404
 *   - Round with no drafts returns 404
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/commit-matches/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost";
const TEST_MONTH = "2099-01"; // Far future to avoid colliding with real data
const TEST_MONTH_DATE = "2099-01-01";

function makeRequest(body: Record<string, unknown> = {}) {
  const secret = process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/commit-matches`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
  });
}

function makeUnauthorizedRequest() {
  return new NextRequest(`${BASE_URL}/api/commit-matches`, {
    method: "POST",
    body: "{}",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong-secret",
    },
  });
}

/** Seeds a match_round row and returns its id. */
async function seedMatchRound(status: "draft" | "committed" | "locked" = "draft") {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("match_rounds")
    .insert({ month: TEST_MONTH_DATE, status, round_score: 800 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedMatchRound failed: ${error?.message}`);
  return data.id as string;
}

/** Seeds a match_draft row for a given round. */
async function seedMatchDraft(
  roundId: string,
  memberId1: string,
  memberId2: string
) {
  const supabase = createTestSupabase();
  const { error } = await supabase.from("match_drafts").insert({
    round_id: roundId,
    member_id_1: memberId1,
    member_id_2: memberId2,
    score: 1000,
    breakdown: { language: 1000, availability: 0, topic: 0, proximity: 0, children: 0 },
    quality_tier: "great",
  });
  if (error) throw new Error(`seedMatchDraft failed: ${error.message}`);
}

/** Opts a member into this round's month (requires a valid topic_id). */
async function seedParticipation(memberId: string) {
  const supabase = createTestSupabase();
  const { data: topic, error: topicError } = await supabase.from("topics").select("id").limit(1).single();
  if (topicError || !topic) throw new Error(`seedParticipation: no topic found: ${topicError?.message}`);
  const { error } = await supabase
    .from("monthly_participation")
    .insert({ member_id: memberId, month: TEST_MONTH_DATE, topic_id: topic.id });
  if (error) throw new Error(`seedParticipation failed: ${error.message}`);
}

/** Explicitly skips a member for this round's month. */
async function seedSkip(memberId: string) {
  const supabase = createTestSupabase();
  const { error } = await supabase
    .from("monthly_skips")
    .insert({ member_id: memberId, month: TEST_MONTH_DATE });
  if (error) throw new Error(`seedSkip failed: ${error.message}`);
}

async function matchEntitlementsFor(memberId: string) {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("match_entitlements")
    .select("event, delta, month, match_id")
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function matchesRemainingFor(memberId: string) {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("members")
    .select("matches_remaining")
    .eq("id", memberId)
    .single();
  if (error) throw new Error(error.message);
  return data.matches_remaining as number;
}

async function setMatchesRemaining(memberId: string, value: number) {
  const supabase = createTestSupabase();
  const { error } = await supabase.from("members").update({ matches_remaining: value }).eq("id", memberId);
  if (error) throw new Error(error.message);
}

/** Cleans up all test data for the test month. */
async function cleanup(memberIds: string[]) {
  const supabase = createTestSupabase();
  // match_drafts cascade from match_rounds
  await supabase.from("match_rounds").delete().eq("month", TEST_MONTH_DATE);
  for (const id of memberIds) {
    await cleanupMember(id);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/commit-matches", () => {
  let memberIds: string[] = [];

  beforeEach(() => {
    memberIds = [];
  });

  afterEach(async () => {
    await cleanup(memberIds);
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  it("returns 401 for an incorrect Bearer token", async () => {
    const res = await POST(makeUnauthorizedRequest());
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // No round / no drafts
  // -------------------------------------------------------------------------

  it("returns 404 when there is no match_round for the given month", async () => {
    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no match round found/i);
  });

  it("returns 404 when the round has no drafts", async () => {
    await seedMatchRound("draft");

    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no drafts found/i);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("promotes drafts to matches and marks the round as committed", async () => {
    const a = await seedMember({ language: ["english"] });
    const b = await seedMember({ language: ["english"] });
    memberIds.push(a.id, b.id);

    const roundId = await seedMatchRound("draft");
    await seedMatchDraft(roundId, a.id, b.id);

    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.committedCount).toBe(1);
    expect(body.roundId).toBe(roundId);
    expect(body.month).toBe(TEST_MONTH);

    const supabase = createTestSupabase();

    // match row written
    const { data: matches } = await supabase
      .from("matches")
      .select("member_id_1, member_id_2, matched_on")
      .or(`member_id_1.eq.${a.id},member_id_2.eq.${a.id}`);
    expect(matches).toHaveLength(1);
    expect([matches![0].member_id_1, matches![0].member_id_2]).toContain(a.id);
    expect([matches![0].member_id_1, matches![0].member_id_2]).toContain(b.id);
    expect(matches![0].matched_on).toBe(TEST_MONTH_DATE);

    // round marked committed
    const { data: round } = await supabase
      .from("match_rounds")
      .select("status, committed_at")
      .eq("id", roundId)
      .single();
    expect(round!.status).toBe("committed");
    expect(round!.committed_at).not.toBeNull();
  });

  it("commits all drafts in the round, not just the first", async () => {
    const a = await seedMember();
    const b = await seedMember();
    const c = await seedMember();
    const d = await seedMember();
    memberIds.push(a.id, b.id, c.id, d.id);

    const roundId = await seedMatchRound("draft");
    await seedMatchDraft(roundId, a.id, b.id);
    await seedMatchDraft(roundId, c.id, d.id);

    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.committedCount).toBe(2);

    const supabase = createTestSupabase();
    const { data: matches } = await supabase
      .from("matches")
      .select("id")
      .or(
        `member_id_1.in.(${[a.id, b.id, c.id, d.id].join(",")}),member_id_2.in.(${[a.id, b.id, c.id, d.id].join(",")})`
      );
    expect(matches).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Idempotency guard
  // -------------------------------------------------------------------------

  it("returns 409 when the round is already committed", async () => {
    await seedMatchRound("committed");

    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already committed/i);
  });

  it("returns 409 when the round is locked", async () => {
    await seedMatchRound("locked");

    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already locked/i);
  });

  // -------------------------------------------------------------------------
  // Ledger decrement — Track B4 (billing-simplification-plan.md §3.2)
  // -------------------------------------------------------------------------
  describe("ledger decrement (Track B4)", () => {
    it("decrements a matched member by 1 (match_delivered)", async () => {
      const a = await seedMember();
      const b = await seedMember();
      memberIds.push(a.id, b.id);
      await seedParticipation(a.id);
      await seedParticipation(b.id);
      await setMatchesRemaining(a.id, 3);
      await setMatchesRemaining(b.id, 3);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, a.id, b.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(a.id)).toBe(2);
      expect(await matchesRemainingFor(b.id)).toBe(2);

      const aRows = await matchEntitlementsFor(a.id);
      expect(aRows).toHaveLength(1);
      expect(aRows[0].event).toBe("match_delivered");
      expect(aRows[0].delta).toBe(-1);
      expect(aRows[0].month).toBe(TEST_MONTH_DATE);
      expect(aRows[0].match_id).not.toBeNull();
    });

    it("decrements a double-matched member only once", async () => {
      const a = await seedMember();
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(a.id, b.id, c.id);
      await seedParticipation(a.id);
      await seedParticipation(b.id);
      await seedParticipation(c.id);
      await setMatchesRemaining(a.id, 3);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, a.id, b.id);
      await seedMatchDraft(roundId, a.id, c.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(a.id)).toBe(2); // debited once, not twice
      const aRows = (await matchEntitlementsFor(a.id)).filter((r) => r.delta < 0);
      expect(aRows).toHaveLength(1);
    });

    it("leaves an opted-in-but-unmatched member's balance untouched", async () => {
      const unmatched = await seedMember();
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(unmatched.id, b.id, c.id);
      await seedParticipation(unmatched.id); // opted in, but nobody paired them
      await seedParticipation(b.id);
      await seedParticipation(c.id);
      await setMatchesRemaining(unmatched.id, 2);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, b.id, c.id); // the round's only pairing

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(unmatched.id)).toBe(2); // untouched
      expect(await matchEntitlementsFor(unmatched.id)).toHaveLength(0);
    });

    it("leaves an explicitly-skipped member's balance untouched", async () => {
      const skipper = await seedMember();
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(skipper.id, b.id, c.id);
      await seedSkip(skipper.id);
      await seedParticipation(b.id);
      await seedParticipation(c.id);
      await setMatchesRemaining(skipper.id, 2);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, b.id, c.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(skipper.id)).toBe(2); // untouched
      expect(await matchEntitlementsFor(skipper.id)).toHaveLength(0);
    });

    it("decrements a silent, currently-paying member (no_response)", async () => {
      const silent = await seedMember({ status: "active" });
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(silent.id, b.id, c.id);
      // silent: no participation row, no skip row — neither opted in nor skipped
      await seedParticipation(b.id);
      await seedParticipation(c.id);
      await setMatchesRemaining(silent.id, 2);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, b.id, c.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(silent.id)).toBe(1);
      const rows = await matchEntitlementsFor(silent.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].event).toBe("no_response");
      expect(rows[0].delta).toBe(-1);
    });

    it("also treats a canceling member's silence as no_response — still paying through period end", async () => {
      const canceling = await seedMember({ status: "canceling" });
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(canceling.id, b.id, c.id);
      await seedParticipation(b.id);
      await seedParticipation(c.id);
      await setMatchesRemaining(canceling.id, 1);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, b.id, c.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(canceling.id)).toBe(0);
      expect(await matchEntitlementsFor(canceling.id)).toHaveLength(1);
    });

    it("never decrements a paused member for silence", async () => {
      const paused = await seedMember({ status: "paused" });
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(paused.id, b.id, c.id);
      await setMatchesRemaining(paused.id, 2);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, b.id, c.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(paused.id)).toBe(2); // untouched — keeps what they hold
      expect(await matchEntitlementsFor(paused.id)).toHaveLength(0);
    });

    it("floors at zero rather than going negative for a non-responder with nothing left", async () => {
      const silent = await seedMember({ status: "active" }); // matches_remaining defaults to 0
      const b = await seedMember();
      const c = await seedMember();
      memberIds.push(silent.id, b.id, c.id);
      await seedParticipation(b.id);
      await seedParticipation(c.id);

      const roundId = await seedMatchRound("draft");
      await seedMatchDraft(roundId, b.id, c.id);

      const res = await POST(makeRequest({ month: TEST_MONTH }));
      expect(res.status).toBe(200);

      expect(await matchesRemainingFor(silent.id)).toBe(0); // not negative
      // The fact is still recorded even though the counter floors.
      expect(await matchEntitlementsFor(silent.id)).toHaveLength(1);
    });
  });
});
