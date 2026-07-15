"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { extendSubscriptionToNext5th } from "@/lib/subscription-utils";
import { verifySkipToken, monthToDate } from "@/lib/tokens";
import { sendAutoPauseEmail } from "@/lib/emails";

export type SkipStatus = "ok" | "already_skipped" | "invalid_token" | "not_found";
export type SkipResult = { status: SkipStatus; email?: string };

const AUTO_PAUSE_THRESHOLD = 3;

export async function recordSkip(
  memberId: string,
  month: string, // YYYY-MM
  token: string
): Promise<SkipResult> {
  // 1. Verify token — prevents spoofed skip links
  if (!verifySkipToken(memberId, month, token)) return { status: "invalid_token" };

  const supabase = createAdminClient();

  // 2. Fetch member — include email so we can pass it to the confirmed page for re-auth
  const { data: member } = await supabase
    .from("members")
    .select("id, email, first_name, status, consecutive_skips, stripe_customer_id")
    .eq("id", memberId)
    .single();

  if (!member) return { status: "not_found" };

  // 3. Idempotency — don't double-record a skip
  const monthDate = monthToDate(month);
  const { data: existingSkip } = await supabase
    .from("monthly_skips")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", monthDate)
    .maybeSingle();

  if (existingSkip) return { status: "already_skipped", email: member.email };

  // 4. Record the skip
  await supabase
    .from("monthly_skips")
    .insert({ member_id: memberId, month: monthDate });

  // 5. Increment consecutive_skips counter
  const newConsecutiveSkips = (member.consecutive_skips ?? 0) + 1;
  await supabase
    .from("members")
    .update({ consecutive_skips: newConsecutiveSkips })
    .eq("id", memberId);

  // 6. Adjust Stripe billing — also returns whether this is a monthly plan
  let isMonthlyPlan = false;
  if (member.stripe_customer_id) {
    isMonthlyPlan = await adjustStripeBilling(memberId, member.stripe_customer_id, month);
  }

  // 7. Auto-pause after threshold — monthly subscribers only.
  // 3-month subscribers have already paid upfront; pausing would forfeit their renewal.
  // They can skip freely for the duration of their term.
  if (isMonthlyPlan && newConsecutiveSkips >= AUTO_PAUSE_THRESHOLD) {
    await autoPauseMember(
      memberId,
      member.stripe_customer_id,
      member.email,
      member.first_name ?? "there"
    );
  }

  return { status: "ok", email: member.email };
}

/**
 * Adjusts billing for a skipped month:
 * - Monthly plans: pause Stripe collection for the skip month (no invoice generated).
 * - 3-month plans: push the current period end to the next match day (member has
 *   already paid upfront; this delays when the next charge fires).
 */
/** Returns true if the member is on a monthly plan (used to gate auto-pause logic). */
async function adjustStripeBilling(
  memberId: string,
  stripeCustomerId: string,
  month: string // YYYY-MM — the month being skipped
): Promise<boolean> {
  const supabase = createAdminClient();
  const stripe = getStripe();

  // Get the active Stripe subscription
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_price_id")
    .eq("member_id", memberId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) return false;

  const stripeSub = await stripe.subscriptions.retrieve(
    sub.stripe_subscription_id,
    { expand: ["items.data.price"] }
  );

  const priceKey = stripeSub.items.data[0]?.price?.lookup_key ?? "";
  const isMonthly = priceKey === "standard_monthly";

  if (isMonthly) {
    // Pause billing for this month — resumes at the start of the next calendar month
    const [year, mon] = month.split("-").map(Number);
    const nextMonth = mon === 12 ? new Date(year + 1, 0, 1) : new Date(year, mon, 1);
    const resumesAt = Math.floor(nextMonth.getTime() / 1000);

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      pause_collection: { behavior: "void", resumes_at: resumesAt },
    });
  } else {
    // 3-month or first20 prepaid plan — push the next billing date forward
    // to the next match day. Member has already paid upfront; this delays
    // the next charge without affecting the already-paid current period.
    await extendSubscriptionToNext5th(sub.stripe_subscription_id);
  }

  return isMonthly;
}

/**
 * Called when a member hits the consecutive skip threshold.
 * Sets their status to "paused", pauses Stripe collection indefinitely,
 * and sends the auto-pause email via Resend.
 */
async function autoPauseMember(
  memberId: string,
  stripeCustomerId: string | null,
  email: string,
  firstName: string
) {
  const supabase = createAdminClient();

  await supabase
    .from("members")
    .update({ status: "paused" })
    .eq("id", memberId);

  if (!stripeCustomerId) return;

  const stripe = getStripe();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", memberId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub?.stripe_subscription_id) {
    // Indefinite pause — no resumes_at. Member resumes manually via billing portal
    // or by replying to the auto-pause email.
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      pause_collection: { behavior: "void" },
    });
  }

  // Send auto-pause notification email
  try {
    await sendAutoPauseEmail(email, firstName);
    console.log("[autoPause] auto-pause email sent to", email);
  } catch (e) {
    console.error("[autoPause] sendAutoPauseEmail failed (non-fatal):", e);
  }
}
