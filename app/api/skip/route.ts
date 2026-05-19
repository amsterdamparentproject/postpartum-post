import { NextRequest, NextResponse } from "next/server";
import { recordSkip } from "@/app/actions/skip";

/**
 * GET /api/skip?member={memberId}&month={YYYY-MM}&token={hmac}
 *
 * One-click skip link included in the 1st-of-month email.
 * Validates the HMAC token, records the skip, adjusts Stripe billing,
 * then redirects to a confirmation page. No login required.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const memberId = searchParams.get("member");
  const month = searchParams.get("month");
  const token = searchParams.get("token");

  if (!memberId || !month || !token) {
    return NextResponse.redirect(`${origin}/`);
  }

  const result = await recordSkip(memberId, month, token);

  switch (result) {
    case "ok":
      return NextResponse.redirect(`${origin}/skip/confirmed`);
    case "already_skipped":
      return NextResponse.redirect(`${origin}/skip/already`);
    case "invalid_token":
    case "not_found":
    default:
      return NextResponse.redirect(`${origin}/`);
  }
}
