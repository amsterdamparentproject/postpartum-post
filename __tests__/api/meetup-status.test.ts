/**
 * GET /api/meetup-status — one-click "We met!" / "We didn't meet" links
 *
 * The reminder email's links carry an HMAC token signed over member, match,
 * status AND an expiry (MEETUP_TOKEN_TTL_MS, ~3 months — see
 * lib/meetup-token.ts). A valid click records the answer on the clicking
 * member's own side of the match, then signs them in via a real Supabase
 * magic link (not mocked — same convention as __tests__/api/optin.test.ts)
 * and lands them on /feedback for that match.
 */

import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { generateMeetupToken, MEETUP_TOKEN_TTL_MS } from "@/lib/meetup-token";
import { GET } from "@/app/api/meetup-status/route";

const BASE_URL = "http://localhost";

async function seedMatch(
  member1Id: string,
  member2Id: string,
  { rematchRequested = false } = {},
): Promise<string> {
  const supabase = createTestSupabase();
  const matchId = crypto.randomUUID();
  const { error } = await supabase.from("matches").insert({
    id: matchId,
    member_id_1: member1Id,
    member_id_2: member2Id,
    matched_on: "2099-06-01",
    rematch_requested: rematchRequested,
  });
  if (error) throw new Error(`seedMatch failed: ${error.message}`);
  return matchId;
}

async function cleanupMatch(matchId: string): Promise<void> {
  const supabase = createTestSupabase();
  await supabase.from("matches").delete().eq("id", matchId);
}

async function getMeetupStatuses(matchId: string): Promise<{ side1: string; side2: string }> {
  const supabase = createTestSupabase();
  const { data } = await supabase
    .from("matches")
    .select("met_up_status_1, met_up_status_2")
    .eq("id", matchId)
    .single();
  return { side1: data!.met_up_status_1, side2: data!.met_up_status_2 };
}

function makeRequest(
  memberId: string,
  matchId: string,
  status: string,
  expiresAt: number,
  token: string,
) {
  const url = `${BASE_URL}/api/meetup-status?member=${memberId}&match=${matchId}&status=${status}&exp=${expiresAt}&token=${token}`;
  return new NextRequest(url, { method: "GET" });
}

// The route redirects through a Supabase magic link whose redirect_to points
// to /auth/confirm?next=<final-dest>. Unwrap both layers to reach the actual
// destination URL — same helper as optin.test.ts.
function getRedirectTarget(location: string | null): string {
  if (!location) return "";
  try {
    const url = new URL(location);
    const redirectTo = url.searchParams.get("redirect_to");
    if (redirectTo) return getRedirectTarget(redirectTo);
    const next = url.searchParams.get("next");
    if (next) return next;
    return location;
  } catch {
    return location;
  }
}

describe("GET /api/meetup-status", () => {
  const matchIds: string[] = [];
  const memberIds: string[] = [];

  afterEach(async () => {
    for (const id of matchIds.splice(0)) await cleanupMatch(id);
    for (const id of memberIds.splice(0)) await cleanupMember(id);
  });

  it("member_id_1 answers 'met' — writes side 1, redirects to feedback with the banner flag", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    memberIds.push(m1.id, m2.id);
    const matchId = await seedMatch(m1.id, m2.id);
    matchIds.push(matchId);

    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const token = generateMeetupToken(m1.id, matchId, "met", exp);
    const res = await GET(makeRequest(m1.id, matchId, "met", exp, token));

    expect(res.status).toBe(307);
    expect(getRedirectTarget(res.headers.get("location"))).toBe(`/feedback?match=${matchId}&met=1`);
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "met", side2: "planning" });
  });

  it("member_id_2 answers 'not_met' — writes side 2 only, redirects to feedback without the banner flag", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    memberIds.push(m1.id, m2.id);
    const matchId = await seedMatch(m1.id, m2.id);
    matchIds.push(matchId);

    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const token = generateMeetupToken(m2.id, matchId, "not_met", exp);
    const res = await GET(makeRequest(m2.id, matchId, "not_met", exp, token));

    expect(res.status).toBe(307);
    expect(getRedirectTarget(res.headers.get("location"))).toBe(`/feedback?match=${matchId}`);
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "not_met" });
  });

  it("rematch-requested match — leaves both sides untouched and sends the member to /matches instead", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    memberIds.push(m1.id, m2.id);
    const matchId = await seedMatch(m1.id, m2.id, { rematchRequested: true });
    matchIds.push(matchId);

    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const token = generateMeetupToken(m1.id, matchId, "met", exp);
    const res = await GET(makeRequest(m1.id, matchId, "met", exp, token));

    expect(getRedirectTarget(res.headers.get("location"))).toBe("/matches");
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "planning" });
  });

  it("tampered token — redirects home and makes no DB write", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    memberIds.push(m1.id, m2.id);
    const matchId = await seedMatch(m1.id, m2.id);
    matchIds.push(matchId);

    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const res = await GET(makeRequest(m1.id, matchId, "met", exp, "not-a-valid-token"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "planning" });
  });

  it("expired token — a signature valid at send time is refused past its 3-month expiry", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    memberIds.push(m1.id, m2.id);
    const matchId = await seedMatch(m1.id, m2.id);
    matchIds.push(matchId);

    const exp = Date.now() - 1; // already expired
    const token = generateMeetupToken(m1.id, matchId, "met", exp);
    const res = await GET(makeRequest(m1.id, matchId, "met", exp, token));

    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "planning" });
  });

  it("valid token for a member who isn't part of the match — redirects home and makes no DB write", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    const outsider = await seedMember();
    memberIds.push(m1.id, m2.id, outsider.id);
    const matchId = await seedMatch(m1.id, m2.id);
    matchIds.push(matchId);

    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const token = generateMeetupToken(outsider.id, matchId, "met", exp);
    const res = await GET(makeRequest(outsider.id, matchId, "met", exp, token));

    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "planning" });
  });

  it("invalid status value — redirects home even with an otherwise well-formed request", async () => {
    const m1 = await seedMember();
    const m2 = await seedMember();
    memberIds.push(m1.id, m2.id);
    const matchId = await seedMatch(m1.id, m2.id);
    matchIds.push(matchId);

    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    // "planning" isn't a valid MeetupLinkStatus — email links only ever offer met/not_met
    const url = `${BASE_URL}/api/meetup-status?member=${m1.id}&match=${matchId}&status=planning&exp=${exp}&token=deadbeef`;
    const res = await GET(new NextRequest(url, { method: "GET" }));

    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "planning" });
  });
});
