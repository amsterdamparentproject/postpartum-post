"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { verifySkipToken, monthToDate } from "@/lib/skip-token";

export type SkipStatus = "ok" | "already_skipped" | "invalid_token" | "not_found";
export type SkipResult = { status: SkipStatus; email?: string };

const SECONDS_PER_DAY = 86_400;
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
    .select("id, email, status, consecutive_skips, stripe_customer_id")
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

  // 6. Adjust Stripe billing
  if (member.stripe_customer_id) {
    await adjustStripeBilling(memberId, member.stripe_customer_id, month);
  }

  // 7. Auto-pause after threshold
  if (newConsecutiveSkips >= AUTO_PAUSE_THRESHOLD) {
    await autoPauseMember(memberId, member.stripe_customer_id);
  }

  return { status: "ok", email: member.email };
}

/**
 * Adjusts billing for a skipped month:
 * - Monthly plans: pause Stripe collection for the skip month (no invoice generated).
 * - 6-month plans: extend the current period end by 30 days (member has already paid
 *   upfront; this pushes when the next €48 charge fires).
 */
async function adjustStripeBilling(
  memberId: string,
  stripeCustomerId: string,
  month: string // YYYY-MM — the month being skipped
) {
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

  if (!sub?.stripe_subscription_id) return;

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
    // 6-month or first20 prepaid plan — push the next billing date forward by 30 days.
    // trial_end on an active subscription delays the next invoice without affecting
    // the already-paid current period.
    const currentPeriodEnd = stripeSub.items.data[0].current_period_end;
    const newPeriodEnd = currentPeriodEnd + 30 * SECONDS_PER_DAY;

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      trial_end: newPeriodEnd,
      proration_behavior: "none",
    });
  }
}

/**
 * Called when a member hits the consecutive skip threshold.
 * Sets their status to "paused" and pauses Stripe collection indefinitely.
 * An auto-pause email should be sent from n8n by watching for status = "paused"
 * or by triggering a webhook from here.
 */
async function autoPauseMember(
  memberId: string,
  stripeCustomerId: string | null
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
}
