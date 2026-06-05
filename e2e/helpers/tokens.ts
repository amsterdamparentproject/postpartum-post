/**
 * Token generation helpers for E2E tests.
 *
 * Replicates the HMAC logic from lib/optin-token.ts and lib/match-token.ts
 * so that tests can construct valid opt-in and match URLs without importing
 * Next.js-bound lib modules.
 *
 * Env vars required (loaded from .env.local by playwright.config.ts):
 *   OPTIN_TOKEN_SECRET, MATCHER_API_SECRET, NEXT_PUBLIC_BASE_URL
 */

import { createHmac } from "crypto";

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

/**
 * Build the full opt-in URL a member would receive in their monthly email.
 * The URL hits /api/optin, records the action, and redirects the member in
 * via a Supabase magic link.
 */
export function buildOptinUrl(
  memberId: string,
  month: string,
  action: "coffee" | "playdate" | "skip",
): string {
  const secret = process.env.OPTIN_TOKEN_SECRET;
  if (!secret) throw new Error("OPTIN_TOKEN_SECRET not set");
  const token = createHmac("sha256", secret)
    .update(`${memberId}:${month}:${action}`)
    .digest("hex");
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base}/api/optin?member=${memberId}&month=${month}&action=${action}&token=${token}`;
}

/**
 * Build the relative path for a match reveal page.
 * Returns a path (no origin) so Playwright's baseURL is prepended automatically.
 */
export function buildMatchPagePath(matchId: string): string {
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) throw new Error("MATCHER_API_SECRET not set");
  const token = createHmac("sha256", secret).update(matchId).digest("hex");
  return `/matches/${matchId}?token=${token}`;
}
