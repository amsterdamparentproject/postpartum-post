import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC-signed match tokens for private match reveal pages.
 *
 * Token = HMAC-SHA256( matchId, MATCHER_API_SECRET )
 *
 * One token per match — the page belongs to the match, not the individual.
 * Both members receive the same link. Token encodes matchId only.
 *
 * Required env var: MATCHER_API_SECRET (any long random string)
 * Generate one with: openssl rand -hex 32
 */

function getSecret(): string {
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) throw new Error("MATCHER_API_SECRET env var is not set");
  return secret;
}

export function generateMatchToken(matchId: string): string {
  return createHmac("sha256", getSecret())
    .update(matchId)
    .digest("hex");
}

export function verifyMatchToken(matchId: string, token: string): boolean {
  const expected = generateMatchToken(matchId);
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const tokenBuf = Buffer.from(token, "hex");
    if (expectedBuf.length !== tokenBuf.length) return false;
    return timingSafeEqual(expectedBuf, tokenBuf);
  } catch {
    return false;
  }
}
