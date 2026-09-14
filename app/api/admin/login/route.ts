import { NextRequest, NextResponse } from "next/server";
import {
  generateAdminSessionToken,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  constantTimeStringEqual,
} from "@/lib/admin-session";

const ADMIN_COOKIE = "admin_session";

/**
 * POST /api/admin/login
 * Body: { username: string, password: string }
 *
 * Validates against ADMIN_USERNAME/ADMIN_PASSWORD — two env vars Alex sets
 * herself, chosen to be memorable rather than a long generated secret out
 * of a password manager. Deliberately not a per-user accounts table:
 * there's exactly one admin. ADMIN_SECRET is a separate env var (see
 * lib/admin-session.ts) used only to sign the session token — it's never
 * typed here and never was the login credential.
 *
 * On success, sets an HttpOnly cookie containing a derived, expiring
 * session token (see lib/admin-session.ts) and returns 200. On failure,
 * returns 401.
 */
export async function POST(req: NextRequest) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const usernameOk = !!body.username && constantTimeStringEqual(body.username, expectedUsername);
  const passwordOk = !!body.password && constantTimeStringEqual(body.password, expectedPassword);

  if (!usernameOk || !passwordOk) {
    // Constant-time-ish delay to blunt brute force
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, generateAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
