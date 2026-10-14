import { describe, it, expect, beforeAll } from "vitest";
import { generateSkipToken, verifySkipToken, generateContinueToken, verifyContinueToken } from "@/lib/tokens";

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

describe("continue tokens", () => {
  it("verifies a valid token for the same member and plan", () => {
    const token = generateContinueToken(MEMBER_ID, "standard_monthly");
    expect(verifyContinueToken(MEMBER_ID, "standard_monthly", token)).toBe(true);
  });

  it("rejects a token used for the other plan or another member", () => {
    const token = generateContinueToken(MEMBER_ID, "standard_monthly");
    expect(verifyContinueToken(MEMBER_ID, "commitment_3mo", token)).toBe(false);
    expect(verifyContinueToken("different-member-id", "standard_monthly", token)).toBe(false);
  });

  it("is not interchangeable with a consent or skip token", () => {
    expect(verifyContinueToken(MEMBER_ID, "standard_monthly", generateSkipToken(MEMBER_ID, MONTH))).toBe(false);
  });

  it("rejects garbage", () => {
    expect(verifyContinueToken(MEMBER_ID, "standard_monthly", "not-hex")).toBe(false);
    expect(verifyContinueToken(MEMBER_ID, "standard_monthly", "")).toBe(false);
  });
});
