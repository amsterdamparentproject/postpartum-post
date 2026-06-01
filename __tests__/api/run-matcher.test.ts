/**
 * Integration tests for POST /api/run-matcher
 *
 * Tests cover the route's orchestration responsibilities:
 *   - Auth enforcement
 *   - Fetching only opted-in members (monthly_participation), not all active members
 *   - dryRun mode: returns results without persisting anything
 *   - Live mode: writes match_rounds + match_drafts rows
 *   - Double-run prevention (409)
 *   - Graceful early return when fewer than 2 members have opted in
 *
 * The core scoring + pairing algorithm is tested in lib/matcher.test.ts.
 * geocodeMembers is mocked to avoid external HTTP calls; runMatcher runs for real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/run-matcher/route";

// --- Mocks ---

vi.mock("@/lib/matcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/matcher")>();
  return {
    ...actual,
    // Return an empty coord map so the matcher runs without geocoding HTTP calls
    geocodeMembers: vi.fn().mockResolvedValue(new Map()),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost";

function makeRequest(body: Record<string, unknown> = {}) {
  const secret = process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/run-matcher`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
  });
}

function makeUnauthorizedRequest() {
  return new NextRequest(`${BASE_URL}/api/run-matcher`, {
    method: "POST",
    body: "{}",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong-secret",
    },
  });
}

/** Returns the uuid for the named topic ("coffee" or "playdate") from the test DB. */
async function getTopicId(name: "coffee" | "playdate"): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("topics")
    .select("id")
    .eq("name", name)
    .single();
  if (error || !data) throw new Error(`Topic "${name}" not found: ${error?.message}`);
  return data.id;
}

/** Seeds a monthly_participation row for a member. */
async function seedParticipation(memberId: string, month: string, topicId: string) {
  const supabase = createTestSupabase();
  const { error } = await supabase
    .from("monthly_participation")
    .insert({ member_id: memberId, month, topic_id: topicId });
  if (error) throw new Error(`seedParticipation failed: ${error.message}`);
}

/** Cleans up match_rounds by month (match_drafts cascade). */
async function cleanupMatchRound(month: string) {
  const supabase = createTestSupabase();
  await supabase.from("match_rounds").delete().eq("month", month);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const THIS_MONTH_DATE = new Date().toISOString().slice(0, 7) + "-01"; // YYYY-MM-01

describe("POST /api/run-matcher", () => {
  let memberIds: string[] = [];

  beforeEach(() => {
    memberIds = [];
  });

  afterEach(async () => {
    await cleanupMatchRound(THIS_MONTH_DATE);
    for (const id of memberIds) {
      await cleanupMember(id);
    }
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  it("returns 401 for an incorrect Bearer token", async () => {
    const req = makeUnauthorizedRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Opt-in pool: only monthly_participation members are matched
  // -------------------------------------------------------------------------

  it("excludes active members with no monthly_participation row from the match pool", async () => {
    // Seed two active members but do NOT opt them in
    const a = await seedMember({ language: ["english"] });
    const b = await seedMember({ language: ["english"] });
    memberIds.push(a.id, b.id);

    const req = makeRequest({ dryRun: true });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    // No opted-in members → not enough to match
    expect(body.matched).toHaveLength(0);
    expect(body.message).toMatch(/not enough opted-in members/i);
  });

  it("includes only members who have a monthly_participation row", async () => {
    const topicId = await getTopicId("coffee");

    // Seed three members: two opt in, one does not
    const a = await seedMember({ language: ["english"] });
    const b = await seedMember({ language: ["english"] });
    const c = await seedMember({ language: ["english"] }); // no participation row
    memberIds.push(a.id, b.id, c.id);

    await seedParticipation(a.id, THIS_MONTH_DATE, topicId);
    await seedParticipation(b.id, THIS_MONTH_DATE, topicId);

    const req = makeRequest({ dryRun: true });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matched).toHaveLength(1);

    const matchedIds = [body.matched[0].member1.id, body.matched[0].member2.id];
    expect(matchedIds).toContain(a.id);
    expect(matchedIds).toContain(b.id);
    expect(matchedIds).not.toContain(c.id);
  });

  // -------------------------------------------------------------------------
  // dryRun mode
  // -------------------------------------------------------------------------

  it("dryRun returns match results without writing to match_rounds or match_drafts", async () => {
    const topicId = await getTopicId("playdate");
    const a = await seedMember({ language: ["dutch"] });
    const b = await seedMember({ language: ["dutch"] });
    memberIds.push(a.id, b.id);

    await seedParticipation(a.id, THIS_MONTH_DATE, topicId);
    await seedParticipation(b.id, THIS_MONTH_DATE, topicId);

    const req = makeRequest({ dryRun: true });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(body.savedCount).toBe(0);
    expect(body.matched).toHaveLength(1);

    // Nothing written to DB
    const supabase = createTestSupabase();
    const { data: round } = await supabase
      .from("match_rounds")
      .select("id")
      .eq("month", THIS_MONTH_DATE)
      .maybeSingle();
    expect(round).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Live run: persists to match_rounds + match_drafts
  // -------------------------------------------------------------------------

  it("saves a match_rounds row and match_drafts rows on a live run", async () => {
    const topicId = await getTopicId("coffee");
    const a = await seedMember({ language: ["english"] });
    const b = await seedMember({ language: ["english"] });
    memberIds.push(a.id, b.id);

    await seedParticipation(a.id, THIS_MONTH_DATE, topicId);
    await seedParticipation(b.id, THIS_MONTH_DATE, topicId);

    const req = makeRequest({ dryRun: false });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(false);
    expect(body.savedCount).toBe(1);

    const supabase = createTestSupabase();

    // match_rounds row created
    const { data: round } = await supabase
      .from("match_rounds")
      .select("id, status, round_score")
      .eq("month", THIS_MONTH_DATE)
      .single();
    expect(round).not.toBeNull();
    expect(round!.status).toBe("draft");

    // match_drafts row created
    const { data: drafts } = await supabase
      .from("match_drafts")
      .select("member_id_1, member_id_2, score, quality_tier")
      .eq("round_id", round!.id);
    expect(drafts).toHaveLength(1);
    const draftIds = [drafts![0].member_id_1, drafts![0].member_id_2];
    expect(draftIds).toContain(a.id);
    expect(draftIds).toContain(b.id);
    expect(drafts![0].quality_tier).toMatch(/^(great|good|needs_work)$/);
  });

  // -------------------------------------------------------------------------
  // Double-run prevention
  // -------------------------------------------------------------------------

  it("returns 409 if a match_rounds row for this month already exists", async () => {
    const topicId = await getTopicId("coffee");
    const a = await seedMember({ language: ["english"] });
    const b = await seedMember({ language: ["english"] });
    memberIds.push(a.id, b.id);

    await seedParticipation(a.id, THIS_MONTH_DATE, topicId);
    await seedParticipation(b.id, THIS_MONTH_DATE, topicId);

    // First run succeeds
    await POST(makeRequest({ dryRun: false }));

    // Second run should be rejected
    const res = await POST(makeRequest({ dryRun: false }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  // -------------------------------------------------------------------------
  // Fewer than 2 opted-in members
  // -------------------------------------------------------------------------

  it("returns an empty result with a message when only one member has opted in", async () => {
    const topicId = await getTopicId("coffee");
    const a = await seedMember();
    memberIds.push(a.id);

    await seedParticipation(a.id, THIS_MONTH_DATE, topicId);

    const req = makeRequest({ dryRun: true });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matched).toHaveLength(0);
    expect(body.unmatched).toHaveLength(1);
    expect(body.message).toMatch(/not enough opted-in members/i);
  });
});
