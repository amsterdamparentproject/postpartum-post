import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC-signed skip tokens for one-click monthly skip links.
 *
 * Token = HMAC-SHA256( "{memberId}:{YYYY-MM}", SKIP_TOKEN_SECRET )
 *
 * This means a token is valid for exactly one member for exactly one month.
 * It can't be guessed, replayed for a different month, or used by another member.
 *
 * Required env var: SKIP_TOKEN_SECRET (any long random string)
 * Generate one with: openssl rand -hex 32
 */

function getSecret(): string {
  const secret = process.env.SKIP_TOKEN_SECRET;
  if (!secret) throw new Error("SKIP_TOKEN_SECRET env var is not set");
  return secret;
}

export function generateSkipToken(memberId: string, month: string): string {
  return createHmac("sha256", getSecret())
    .update(`${memberId}:${month}`)
    .digest("hex");
}

export function verifySkipToken(
  memberId: string,
  month: string,
  token: string
): boolean {
  const expected = generateSkipToken(memberId, month);
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const tokenBuf = Buffer.from(token, "hex");
    if (expectedBuf.length !== tokenBuf.length) return false;
    return timingSafeEqual(expectedBuf, tokenBuf);
  } catch {
    return false;
  }
}

/** Returns the current month as YYYY-MM, e.g. "2026-05" */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Converts YYYY-MM to a date string Postgres can store: YYYY-MM-01 */
export function monthToDate(month: string): string {
  return `${month}-01`;
}
