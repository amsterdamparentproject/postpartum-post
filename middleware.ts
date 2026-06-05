import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "admin_session";

/**
 * Protects all /admin/* routes with a token-based session cookie.
 * The cookie is set by POST /api/admin/login and contains the ADMIN_SECRET.
 * If missing or invalid, redirect to /admin/login.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page and login API through unconditionally
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // Misconfigured — block access
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (cookie !== secret) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
