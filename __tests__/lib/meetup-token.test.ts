import { describe, it, expect, beforeAll } from "vitest";
import { generateMeetupToken, verifyMeetupToken, MEETUP_TOKEN_TTL_MS } from "@/lib/meetup-token";

beforeAll(() => {
  process.env.OPTIN_TOKEN_SECRET ??= "test-secret";
});

describe("meetup tokens", () => {
  it("verifies only for the exact member, match, answer and expiry", () => {
    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const token = generateMeetupToken("member-a", "match-1", "met", exp);
    expect(verifyMeetupToken("member-a", "match-1", "met", exp, token)).toBe(true);
    expect(verifyMeetupToken("member-b", "match-1", "met", exp, token)).toBe(false);
    expect(verifyMeetupToken("member-a", "match-2", "met", exp, token)).toBe(false);
    expect(verifyMeetupToken("member-a", "match-1", "not_met", exp, token)).toBe(false);
    expect(verifyMeetupToken("member-a", "match-1", "met", exp + 1, token)).toBe(false);
  });

  it("rejects garbage tokens", () => {
    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    expect(verifyMeetupToken("member-a", "match-1", "met", exp, "not-hex")).toBe(false);
  });

  it("rejects an expired token even with a valid signature", () => {
    const exp = Date.now() - 1;
    const token = generateMeetupToken("member-a", "match-1", "met", exp);
    expect(verifyMeetupToken("member-a", "match-1", "met", exp, token)).toBe(false);
  });

  it("rejects a missing or non-numeric expiry", () => {
    const exp = Date.now() + MEETUP_TOKEN_TTL_MS;
    const token = generateMeetupToken("member-a", "match-1", "met", exp);
    expect(verifyMeetupToken("member-a", "match-1", "met", NaN, token)).toBe(false);
  });
});
