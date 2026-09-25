import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC-signed tokens for the one-click "Did you meet up?" links in the
 * meetup reminder email (see /api/meetup-status).
 *
 * Token = HMAC-SHA256( "meetup:{memberId}:{matchId}:{status}:{expiresAt}", OPTIN_TOKEN_SECRET )
 *
 * Reuses OPTIN_TOKEN_SECRET; the "meetup:" prefix keeps these from ever
 * colliding with opt-in tokens. Valid for exactly one member, one match and
 * one answer, and only until expiresAt (signed into the token itself, so it
 * can't be extended by tampering with the URL's exp param alone).
 */

export type MeetupLinkStatus = "met" | "not_met";

/** How long a link in the reminder email stays clickable after it's sent. */
export const MEETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90; // ~3 months

function getSecret(): string {
  const secret = process.env.OPTIN_TOKEN_SECRET;
  if (!secret) throw new Error("OPTIN_TOKEN_SECRET env var is not set");
  return secret;
}

export function generateMeetupToken(
  memberId: string,
  matchId: string,
  status: MeetupLinkStatus,
  expiresAt: number,
): string {
  return createHmac("sha256", getSecret())
    .update(`meetup:${memberId}:${matchId}:${status}:${expiresAt}`)
    .digest("hex");
}

export function verifyMeetupToken(
  memberId: string,
  matchId: string,
  status: MeetupLinkStatus,
  expiresAt: number,
  token: string,
): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  try {
    const expected = Buffer.from(generateMeetupToken(memberId, matchId, status, expiresAt), "hex");
    const given = Buffer.from(token, "hex");
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/** Absolute one-click URL for the reminder email, expiring MEETUP_TOKEN_TTL_MS from now. */
export function meetupStatusUrl(siteUrl: string, memberId: string, matchId: string, status: MeetupLinkStatus): string {
  const expiresAt = Date.now() + MEETUP_TOKEN_TTL_MS;
  const token = generateMeetupToken(memberId, matchId, status, expiresAt);
  return `${siteUrl}/api/meetup-status?member=${memberId}&match=${matchId}&status=${status}&exp=${expiresAt}&token=${token}`;
}
