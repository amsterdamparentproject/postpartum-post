import { NextRequest, NextResponse } from "next/server";

/**
 * GET /signup?email={email}&firstName={firstName}&lastName={lastName}
 *
 * Friendly, memorable link (for emails, DMs, etc.) that redirects to the
 * signup form on the homepage. Forwards email/firstName/lastName so
 * SignupForm can prefill them. Kept off the homepage render so `/` stays
 * statically prerendered — see app/canceled/route.ts for the same pattern.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const url = new URL("/", origin);
  for (const key of ["email", "firstName", "lastName"]) {
    const value = searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  url.hash = "subscribe";

  return NextResponse.redirect(url);
}
