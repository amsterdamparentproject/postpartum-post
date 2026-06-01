/**
 * Integration tests for POST /api/lock-matches
 *
 * Tests cover:
 *   - Auth enforcement
 *   - Happy path: committed round is locked, locked_at is stamped
 *   - 404 when no round exists for the month
 *   - 409 when round is still in draft (not yet committed)
 *   - 409 when round is already locked
 */

import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/lock-matches/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost";
const TEST_MONTH = "2099-02";
const TEST_MONTH_DATE = "2099-02-01";

function makeRequest(body: Record<string, unknown> = {}) {
  const secret = process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/lock-matches`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
  });
}

async function seedMatchRound(status: "draft" | "committed" | "locked") {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("match_rounds")
    .insert({ month: TEST_MONTH_DATE, status, round_score: 800 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedMatchRound failed: ${error?.message}`);
  return data.id as string;
}

afterEach(async () => {
  const supabase = createTestSupabase();
  await supabase.from("match_rounds").delete().eq("month", TEST_MONTH_DATE);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/lock-matches", () => {
  it("returns 401 for an incorrect Bearer token", async () => {
    const req = new NextRequest(`${BASE_URL}/api/lock-matches`, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when there is no round for the given month", async () => {
    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no match round found/i);
  });

  it("returns 409 when the round is still in draft", async () => {
    await seedMatchRound("draft");
    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/draft/i);
  });

  it("returns 409 when the round is already locked", async () => {
    await seedMatchRound("locked");
    const res = await POST(makeRequest({ month: TEST_MONTH }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
  });

  it("locks a committed round and stamps locked_at", async () => {
    const roundId = await seedMatchRound("committed");

    const before = new Date();
    const res = await POST(makeRequest({ month: TEST_MONTH }));
    const after = new Date();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roundId).toBe(roundId);
    expect(body.month).toBe(TEST_MONTH);

    const supabase = createTestSupabase();
    const { data: round } = await supabase
      .from("match_rounds")
      .select("status, locked_at")
      .eq("id", roundId)
      .single();

    expect(round!.status).toBe("locked");
    const lockedAt = new Date(round!.locked_at);
    expect(lockedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(lockedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
