import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyOptinToken, type OptinAction } from "@/lib/optin-token";
import { monthToDate } from "@/lib/skip-token";

/**
 * GET /api/optin?member={memberId}&month={YYYY-MM}&action={coffee|playdate|skip}&token={hmac}
 *
 * One-click opt-in link included in the 1st-of-month email.
 * Validates the HMAC token, then:
 *   - coffee / playdate → records participation in monthly_participation
 *   - skip              → records skip, extends subscription, increments consecutive_skips
 *
 * Redirects to a confirmation page. No login required.
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

  if (action === "skip") {
    // Insert a monthly_skip row and extend the subscription
    const monthDate = monthToDate(month);

    const { data: existing } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();

    if (existing) {
      return NextResponse.redirect(`${origin}/optin/already?action=skip`);
    }

    const { error: skipError } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: monthDate });

    if (skipError) {
      console.error("[optin] Failed to record skip:", skipError);
      return NextResponse.redirect(`${origin}/`);
    }

    // Extend subscription by one month
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

    // Increment consecutive_skips
    const { data: member } = await supabase
      .from("members")
      .select("consecutive_skips")
      .eq("id", memberId)
      .single();

    if (member) {
      await supabase
        .from("members")
        .update({ consecutive_skips: member.consecutive_skips + 1 })
        .eq("id", memberId);
    }

    return NextResponse.redirect(`${origin}/optin/confirmed?action=skip`);
  }

  // coffee or playdate — look up the topic and record participation
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

  // Upsert — if they already opted in this month, update their topic choice
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

  // Reset consecutive_skips since they're actively participating
  await supabase
    .from("members")
    .update({ consecutive_skips: 0 })
    .eq("id", memberId);

  return NextResponse.redirect(`${origin}/optin/confirmed?action=${action}`);
}
