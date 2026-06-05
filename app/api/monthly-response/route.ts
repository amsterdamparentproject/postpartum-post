import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { extendSubscriptionByOneMonth, cancelSubscription } from "@/lib/subscription-utils";

const MAX_CONSECUTIVE_SKIPS = 3;

export async function POST(req: NextRequest) {
  const { memberId, action } = await req.json();

  if (!memberId || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, consecutive_skips, status")
    .eq("id", memberId)
    .single();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .single();

  if (subError || !subscription) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  if (action === "skip") {
    const newConsecutiveSkips = member.consecutive_skips + 1;

    if (newConsecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
      await cancelSubscription(subscription.stripe_subscription_id);
      await supabase
        .from("members")
        .update({ status: "inactive", consecutive_skips: newConsecutiveSkips })
        .eq("id", memberId);
      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", subscription.stripe_subscription_id);
      return NextResponse.json({ result: "canceled", reason: "max_skips_reached" });
    }

    await extendSubscriptionByOneMonth(subscription.stripe_subscription_id);
    await supabase
      .from("members")
      .update({ consecutive_skips: newConsecutiveSkips })
      .eq("id", memberId);

    return NextResponse.json({ result: "extended", consecutive_skips: newConsecutiveSkips });
  }

  if (action === "participate") {
    await supabase
      .from("members")
      .update({ consecutive_skips: 0 })
      .eq("id", memberId);

    return NextResponse.json({ result: "participating" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
