/**
 * getMatchPageData — auth gate tests
 *
 * /matches/[id] used to be reachable by anyone holding the link (token
 * only, no login). It now also requires being signed in as one of the two
 * members on that specific match. These tests exist to guarantee that gate
 * actually holds — a signed-out visitor or an unrelated signed-in member
 * must never get match data back, even with a fully valid link token.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  seedMember,
  cleanupMember,
  createTestSupabase,
  getAccessTokenForEmail,
  cleanupAuthUser,
} from "@tests/helpers";
import { generateMatchToken } from "@/lib/match-token";
import { isMember1Initiator } from "@/lib/match-initiator";
import { getMatchPageData } from "@/app/actions/match-page";

async function seedMatch(
  member1Id: string,
  member2Id: string,
  { matchedOn = "2099-03-01", rematchRequested = false } = {},
): Promise<string> {
  const supabase = createTestSupabase();
  const matchId = crypto.randomUUID();
  const { error } = await supabase.from("matches").insert({
    id: matchId,
    member_id_1: member1Id,
    member_id_2: member2Id,
    matched_on: matchedOn,
    rematch_requested: rematchRequested,
  });
  if (error) throw new Error(`seedMatch failed: ${error.message}`);
  return matchId;
}

async function cleanupMatch(matchId: string): Promise<void> {
  const supabase = createTestSupabase();
  await supabase.from("matches").delete().eq("id", matchId);
}

async function getTopicId(name: "coffee" | "playdate"): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase.from("topics").select("id").eq("name", name).single();
  if (error || !data) throw new Error(`Topic "${name}" not found`);
  return data.id as string;
}

async function seedParticipation(memberId: string, topicId: string, month: string): Promise<void> {
  const supabase = createTestSupabase();
  const { error } = await supabase.from("monthly_participation").insert({
    member_id: memberId,
    month,
    topic_id: topicId,
  });
  if (error) throw new Error(`seedParticipation failed: ${error.message}`);
}

async function cleanupParticipation(memberId: string, month: string): Promise<void> {
  const supabase = createTestSupabase();
  await supabase.from("monthly_participation").delete().eq("member_id", memberId).eq("month", month);
}

describe("getMatchPageData", () => {
  const matchIds: string[] = [];
  const memberIds: string[] = [];
  const authEmails: string[] = [];

  afterEach(async () => {
    for (const id of matchIds.splice(0)) await cleanupMatch(id);
    for (const id of memberIds.splice(0)) await cleanupMember(id);
    for (const email of authEmails.splice(0)) await cleanupAuthUser(email);
  });

  it("rejects an invalid link token outright", async () => {
    const result = await getMatchPageData(crypto.randomUUID(), "not-a-real-token", "irrelevant");
    expect(result).toEqual({ authorized: false, reason: "invalid" });
  });

  it("rejects a missing/invalid access token even with a valid link token", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Gate" });
    const b = await seedMember({ first_name: "Bob", last_name: "Gate" });
    memberIds.push(a.id, b.id);

    const matchId = await seedMatch(a.id, b.id);
    matchIds.push(matchId);

    const token = generateMatchToken(matchId);
    const result = await getMatchPageData(matchId, token, "garbage-not-a-jwt");
    expect(result).toEqual({ authorized: false, reason: "not_signed_in" });
  });

  it("rejects a signed-in member who isn't part of this match", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Gate" });
    const b = await seedMember({ first_name: "Bob", last_name: "Gate" });
    const outsider = await seedMember({ first_name: "Casey", last_name: "Outsider" });
    memberIds.push(a.id, b.id, outsider.id);

    const matchId = await seedMatch(a.id, b.id);
    matchIds.push(matchId);

    const token = generateMatchToken(matchId);
    const accessToken = await getAccessTokenForEmail(outsider.email);
    authEmails.push(outsider.email);

    const result = await getMatchPageData(matchId, token, accessToken);
    expect(result).toEqual({ authorized: false, reason: "forbidden" });
  });

  it("returns match data for a signed-in member who is part of the match", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Gate" });
    const b = await seedMember({ first_name: "Bob", last_name: "Gate" });
    memberIds.push(a.id, b.id);

    const matchId = await seedMatch(a.id, b.id);
    matchIds.push(matchId);

    const token = generateMatchToken(matchId);
    const accessToken = await getAccessTokenForEmail(a.email);
    authEmails.push(a.email);

    const result = await getMatchPageData(matchId, token, accessToken);
    expect(result.authorized).toBe(true);
    if (!result.authorized || result.rematchRequested) {
      throw new Error("expected an authorized, non-rematched result");
    }
    expect([result.m1.first_name, result.m2.first_name].sort()).toEqual(["Alice", "Bob"]);
    expect(["Alice", "Bob"]).toContain(result.initiatorName);
    expect(result.viewerMemberId).toBe(a.id);
  });

  it("also authorizes the other member of the pair (not just member_id_1)", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Gate" });
    const b = await seedMember({ first_name: "Bob", last_name: "Gate" });
    memberIds.push(a.id, b.id);

    const matchId = await seedMatch(a.id, b.id);
    matchIds.push(matchId);

    const token = generateMatchToken(matchId);
    const accessToken = await getAccessTokenForEmail(b.email);
    authEmails.push(b.email);

    const result = await getMatchPageData(matchId, token, accessToken);
    expect(result.authorized).toBe(true);
    if (!result.authorized || result.rematchRequested) throw new Error("expected a ready result");
    expect(result.viewerMemberId).toBe(b.id);
  });

  it("reports viewerIsM1 and viewerIsInitiator correctly for both members", async () => {
    // These flags drive which "Get started" copy and which mailto CTA
    // render on the match page — a wrong value means someone sees the
    // wrong instructions or a CTA addressed to the wrong person.
    const a = await seedMember({ first_name: "Alice", last_name: "Gate" });
    const b = await seedMember({ first_name: "Bob", last_name: "Gate" });
    memberIds.push(a.id, b.id);

    const matchId = await seedMatch(a.id, b.id);
    matchIds.push(matchId);
    const token = generateMatchToken(matchId);
    const expectedM1Initiator = isMember1Initiator(matchId);

    const aAccessToken = await getAccessTokenForEmail(a.email);
    authEmails.push(a.email);
    const resultA = await getMatchPageData(matchId, token, aAccessToken);
    if (!resultA.authorized || resultA.rematchRequested) throw new Error("expected a ready result for member A");
    expect(resultA.viewerIsM1).toBe(true);
    expect(resultA.viewerIsInitiator).toBe(expectedM1Initiator);
    expect(resultA.viewerMemberId).toBe(a.id);

    const bAccessToken = await getAccessTokenForEmail(b.email);
    authEmails.push(b.email);
    const resultB = await getMatchPageData(matchId, token, bAccessToken);
    if (!resultB.authorized || resultB.rematchRequested) throw new Error("expected a ready result for member B");
    expect(resultB.viewerIsM1).toBe(false);
    expect(resultB.viewerIsInitiator).toBe(!expectedM1Initiator);
    expect(resultB.viewerMemberId).toBe(b.id);
  });

  it("resolves the shared topic, or null if the members disagree", async () => {
    const month = "2099-03-01";
    const coffeeId = await getTopicId("coffee");
    const playdateId = await getTopicId("playdate");

    const a = await seedMember({ first_name: "Alice", last_name: "Topic" });
    const b = await seedMember({ first_name: "Bob", last_name: "Topic" });
    memberIds.push(a.id, b.id);

    const matchId = await seedMatch(a.id, b.id, { matchedOn: month });
    matchIds.push(matchId);
    const token = generateMatchToken(matchId);
    const accessToken = await getAccessTokenForEmail(a.email);
    authEmails.push(a.email);

    try {
      await seedParticipation(a.id, coffeeId, month);
      await seedParticipation(b.id, coffeeId, month);

      const agree = await getMatchPageData(matchId, token, accessToken);
      if (!agree.authorized || agree.rematchRequested) throw new Error("expected a ready result");
      expect(agree.topic).toBe("coffee");

      await cleanupParticipation(a.id, month);
      await cleanupParticipation(b.id, month);
      await seedParticipation(a.id, coffeeId, month);
      await seedParticipation(b.id, playdateId, month);

      const disagree = await getMatchPageData(matchId, token, accessToken);
      if (!disagree.authorized || disagree.rematchRequested) throw new Error("expected a ready result");
      expect(disagree.topic).toBeNull();
    } finally {
      await cleanupParticipation(a.id, month);
      await cleanupParticipation(b.id, month);
    }
  });

  it("hides contact details once a rematch has been requested", async () => {
    const a = await seedMember({ first_name: "Alice", last_name: "Gate" });
    const b = await seedMember({ first_name: "Bob", last_name: "Gate" });
    memberIds.push(a.id, b.id);

    const matchId = await seedMatch(a.id, b.id, { rematchRequested: true });
    matchIds.push(matchId);

    const token = generateMatchToken(matchId);
    const accessToken = await getAccessTokenForEmail(a.email);
    authEmails.push(a.email);

    const result = await getMatchPageData(matchId, token, accessToken);
    // Exact shape check — proves no m1/m2/contact fields leak alongside
    // rematchRequested: true.
    expect(result).toEqual({ authorized: true, rematchRequested: true });
  });
});
