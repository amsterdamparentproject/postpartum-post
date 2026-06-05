import { NextRequest, NextResponse } from "next/server";
import { abandonCheckout } from "@/app/actions/signup";

/**
 * GET /canceled?session_id={CHECKOUT_SESSION_ID}
 *
 * Stripe's checkout cancel_url lands here. Marks the member abandoned
 * (best-effort) so they can re-subscribe without hitting the duplicate-email
 * error, then redirects to the homepage. Kept off the homepage render so `/`
 * stays statically prerendered.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const sessionId = searchParams.get("session_id");
  if (sessionId?.startsWith("cs_")) {
    await abandonCheckout(sessionId);
  }

  return NextResponse.redirect(`${origin}/`);
}
