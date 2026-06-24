import { describe, it, expect, beforeAll } from "vitest";
import { generateSkipToken, verifySkipToken } from "@/lib/tokens";

beforeAll(() => {
  if (!process.env.SKIP_TOKEN_SECRET) {
    throw new Error("SKIP_TOKEN_SECRET must be set in .env.test");
  }
});

const MEMBER_ID = "member-abc-123";
const MONTH = "2025-03";

describe("tokens", () => {
  it("verifies a valid token successfully", () => {
    const token = generateSkipToken(MEMBER_ID, MONTH);
    expect(verifySkipToken(MEMBER_ID, MONTH, token)).toBe(true);
  });

  it("rejects a token with a tampered member ID", () => {
    const token = generateSkipToken(MEMBER_ID, MONTH);
    expect(verifySkipToken("different-member-id", MONTH, token)).toBe(false);
  });

  it("rejects a token with a tampered month", () => {
    const token = generateSkipToken(MEMBER_ID, MONTH);
    expect(verifySkipToken(MEMBER_ID, "2025-04", token)).toBe(false);
  });
});
