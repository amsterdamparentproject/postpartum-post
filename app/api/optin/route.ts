import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyOptinToken, type OptinAction } from "@/lib/optin-token";
import { monthToDate } from "@/lib/skip-token";

/**
 * GET /api/optin?member={memberId}&month={YYYY-MM}&action={coffee|playdate|skip}&token={hmac}
 *
 * One-click opt-in link included in the 1st-of-month email.
 * Validates the HMAC token, records the member's choice, then generates a
 * Supabase magic link so the member is signed in automatically when they land
 * on /profile — no separate sign-in step required.
 *
 * Falls back to a plain /profile redirect if magic link generation fails.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const memberId = searchParams.get("member");
  const month = searchParams.get("month");
  const action = searchParams.get("action") as OptinAction | null;

  if (
    !memberId ||
    !month ||
    !action ||
    !["coffee", "playdate", "skip"].includes(action)
  ) {
    return NextResponse.redirect(`${origin}/`);
  }

  const token = searchParams.get("token");
  if (!token || !verifyOptinToken(memberId, month, action, token)) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = createAdminClient();

  // Fetch member email (needed for magic link generation)
  const { data: memberRow } = await supabase
    .from("members")
    .select("email, consecutive_skips")
    .eq("id", memberId)
    .single();

  if (!memberRow) {
    return NextResponse.redirect(`${origin}/`);
  }

  // -------------------------------------------------------------------------
  // Record the action
  // -------------------------------------------------------------------------

  if (action === "skip") {
    const monthDate = monthToDate(month);

    const { data: existing } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();

    if (existing) {
      return signInAndRedirect(supabase, memberRow.email, `${origin}/billing?optin=already_skip`, origin);
    }

    const { error: skipError } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: monthDate });

    if (skipError) {
      console.error("[optin] Failed to record skip:", skipError);
      return NextResponse.redirect(`${origin}/`);
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("member_id", memberId)
      .eq("status", "active")
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      const { extendSubscriptionByOneMonth } = await import("@/lib/subscription-utils");
      await extendSubscriptionByOneMonth(sub.stripe_subscription_id);
    }

    await supabase
      .from("members")
      .update({ consecutive_skips: memberRow.consecutive_skips + 1 })
      .eq("id", memberId);

    return signInAndRedirect(supabase, memberRow.email, `${origin}/billing?optin=skip`, origin);
  }

  // coffee or playdate
  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("name", action)
    .maybeSingle();

  if (topicError || !topic) {
    console.error("[optin] Topic not found for action:", action, topicError);
    return NextResponse.redirect(`${origin}/`);
  }

  const monthDate = monthToDate(month);

  const { error: participationError } = await supabase
    .from("monthly_participation")
    .upsert(
      { member_id: memberId, month: monthDate, topic_id: topic.id },
      { onConflict: "member_id,month" }
    );

  if (participationError) {
    console.error("[optin] Failed to record participation:", participationError);
    return NextResponse.redirect(`${origin}/`);
  }

  await supabase
    .from("members")
    .update({ consecutive_skips: 0 })
    .eq("id", memberId);

  return signInAndRedirect(supabase, memberRow.email, `${origin}/profile?optin=${action}`, origin);
}

// ---------------------------------------------------------------------------
// Helper: generate a Supabase magic link and redirect to it.
// Falls back to a plain redirect if generation fails.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signInAndRedirect(supabase: any, email: string, redirectTo: string, origin: string) {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (!error && data?.properties?.action_link) {
      return NextResponse.redirect(data.properties.action_link);
    }
  } catch (err) {
    console.error("[optin] Failed to generate magic link:", err);
  }

  // Fallback — member lands on profile but may need to sign in manually
  return NextResponse.redirect(redirectTo);
}
