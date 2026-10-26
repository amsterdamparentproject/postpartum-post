import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyContinueToken } from "@/lib/tokens";
import { createContinueCheckoutUrl, isContinuePlan } from "@/lib/continue-offer";
import { logError } from "@/lib/log-error";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

/**
 * One-click links from the cohort "continue" email: /api/continue?member_id=…&plan=…&token=…
 * A valid token starts a Stripe Checkout with the cohort's discount already
 * applied. Anything else lands on /billing, which asks logged-out visitors to
 * sign in and shows signed-in members their status.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("member_id");
  const plan = searchParams.get("plan");
  const token = searchParams.get("token");

  if (!memberId || !token || !isContinuePlan(plan) || !verifyContinueToken(memberId, plan, token)) {
    return NextResponse.redirect(`${SITE_URL}/billing`, 303);
  }

  try {
    const result = await createContinueCheckoutUrl(createAdminClient(), memberId, plan);
    if ("url" in result) return NextResponse.redirect(result.url, 303);
    console.error("[continue] checkout not started:", result.error, { memberId });
  } catch (e) {
    console.error("[continue] checkout failed:", e);
    await logError("billing.continue.checkout_failed", e, { memberId });
  }
  return NextResponse.redirect(`${SITE_URL}/billing`, 303);
}
