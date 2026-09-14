import { createHmac, timingSafeEqual } from "crypto";

/**
 * Derived, expiring admin session tokens.
 *
 * Token = "{issuedAt}.{HMAC-SHA256(issuedAt, ADMIN_SECRET)}"
 *
 * The cookie carries a value derived from ADMIN_SECRET, never the secret
 * itself, so a leaked cookie (logs, shared machine, a future XSS) can't be
 * replayed as the master credential and expires on its own
 * (see __claude__/security-audit-2026-07-24.md, Finding 3).
 *
 * ADMIN_SECRET is purely this signing key — it's never typed by anyone.
 * The actual login credentials (what Alex types at /admin/login) are the
 * separate ADMIN_USERNAME/ADMIN_PASSWORD env vars, checked in
 * app/api/admin/login/route.ts via constantTimeStringEqual below. Kept
 * apart deliberately: ADMIN_SECRET can stay a long random string (good
 * signing entropy) while the login password can be short and memorable
 * without weakening the session token itself.
 */

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET env var is not set");
  return secret;
}

function sign(issuedAt: string): string {
  return createHmac("sha256", getSecret()).update(issuedAt).digest("hex");
}

export function generateAdminSessionToken(): string {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expected = sign(issuedAt);
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const signatureBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== signatureBuf.length) return false;
    if (!timingSafeEqual(expectedBuf, signatureBuf)) return false;
  } catch {
    return false;
  }

  const ageSeconds = (Date.now() - Number(issuedAt)) / 1000;
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}

export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

/**
 * Constant-time comparison for plain UTF-8 strings (login username/
 * password), as opposed to the hex-signature compare above. Length is
 * checked first and short-circuits before timingSafeEqual — same accepted
 * minor leak (string length) as the signature check above; nothing else
 * about either string is observable via timing.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
