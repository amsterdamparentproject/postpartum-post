import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC-signed opt-in tokens for one-click monthly opt-in links.
 *
 * Token = HMAC-SHA256( "{memberId}:{YYYY-MM}:{action}", OPTIN_TOKEN_SECRET )
 *
 * action is one of: "coffee" | "playdate" | "skip"
 *
 * A token is valid for exactly one member, one month, and one action.
 * It can't be guessed, replayed for a different month, or used by another member.
 *
 * Required env var: OPTIN_TOKEN_SECRET (any long random string)
 * Generate one with: openssl rand -hex 32
 */

export type OptinAction = "coffee" | "playdate" | "skip";

function getSecret(): string {
  const secret = process.env.OPTIN_TOKEN_SECRET;
  if (!secret) throw new Error("OPTIN_TOKEN_SECRET env var is not set");
  return secret;
}

export function generateOptinToken(
  memberId: string,
  month: string,
  action: OptinAction
): string {
  return createHmac("sha256", getSecret())
    .update(`${memberId}:${month}:${action}`)
    .digest("hex");
}

export function verifyOptinToken(
  memberId: string,
  month: string,
  action: OptinAction,
  token: string
): boolean {
  const expected = generateOptinToken(memberId, month, action);
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const tokenBuf = Buffer.from(token, "hex");
    if (expectedBuf.length !== tokenBuf.length) return false;
    return timingSafeEqual(expectedBuf, tokenBuf);
  } catch {
    return false;
  }
}
