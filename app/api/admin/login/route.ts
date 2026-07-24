import { NextRequest, NextResponse } from "next/server";
import { generateAdminSessionToken, ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/admin-session";

const ADMIN_COOKIE = "admin_session";

/**
 * POST /api/admin/login
 * Body: { secret: string }
 *
 * Validates the secret against ADMIN_SECRET. On success, sets an HttpOnly
 * cookie containing a derived, expiring session token (never the secret
 * itself — see lib/admin-session.ts) and returns 200. On failure, returns 401.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let body: { secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.secret || body.secret !== secret) {
    // Constant-time-ish delay to blunt brute force
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
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
