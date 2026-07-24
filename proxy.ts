import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin-session";

const ADMIN_COOKIE = "admin_session";

/**
 * Protects all /admin/* routes with a token-based session cookie.
 * The cookie is set by POST /api/admin/login to a derived, expiring token
 * (see lib/admin-session.ts) — never the raw ADMIN_SECRET. If missing,
 * invalid, or expired, redirect to /admin/login.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page and login API through unconditionally
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  if (!process.env.ADMIN_SECRET) {
    // Misconfigured — block access
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!verifyAdminSessionToken(cookie)) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
