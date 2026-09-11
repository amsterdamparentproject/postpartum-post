import { createAdminClient } from "@/lib/supabase";
import { recordEntitlement } from "@/lib/match-ledger";

export type GrantResult = {
  memberEmail: string;
  matchesGranted: number;
  matchesRemaining: number;
};

/**
 * Grants an existing, active member one free month by crediting their
 * matches_remaining counter directly — no coupon, no checkout session, no
 * charge, no Stripe call at all. For new (not-yet-subscribed) recipients,
 * use the gift card flow (lib/gift-cards.ts) instead — this function is
 * specifically for members who already have an active subscription.
 *
 * Track F: this used to push the Stripe subscription's billing date out
 * (pausing collection for monthly plans, extending `trial_end` for 3-month
 * plans via the shared extendSubscriptionToNext5th helper) — a plan-type
 * branch that made sense when a subscription's own billing date WAS the
 * thing being granted. Now that renew-check (Track E1) bills purely off
 * matches_remaining and ignores Stripe billing dates entirely, neither old
 * branch does anything useful: pausing an already-paused subscription
 * (Track E2 pauses every subscription right after each payment) is a
 * no-op, and pushing `trial_end` on a subscription nothing reads `trial_end`
 * from is invisible. A free month is just +1 on the counter, plan-blind.
 *
 * Writes a `manual_grant` match_entitlements row (see lib/match-ledger.ts)
 * so the grant is visible in the same ledger as every other credit/debit,
 * tagged with `grantReason` as the note — following the same "one JS-side
 * entry point" convention every other entitlement change already uses.
 *
 * `grantReason` is a free-text string (e.g. "customer_service", "art_comp")
 * — not validated against a fixed list, so new reasons can be used without
 * a code change.
 *
 * Does not send any customer-facing email yet — that's a follow-up TODO.
 */
export async function grantFreeMonth(
  memberEmail: string,
  grantReason: string
): Promise<GrantResult> {
  const supabase = createAdminClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, email")
    .eq("email", memberEmail.toLowerCase())
    .single();

  if (memberError || !member) {
    throw new Error(`No member found with email ${memberEmail}`);
  }

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", member.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError || !sub?.stripe_subscription_id) {
    throw new Error(`No active subscription found for ${memberEmail}`);
  }

  const matchesGranted = 1;

  await recordEntitlement(supabase, {
    memberId: member.id,
    event: "manual_grant",
    delta: matchesGranted,
    note: grantReason,
  });

  const { data: updatedMember } = await supabase
    .from("members")
    .select("matches_remaining")
    .eq("id", member.id)
    .single();

  const matchesRemaining = updatedMember?.matches_remaining ?? matchesGranted;

  console.log(
    `[grant-free-month] Granted +${matchesGranted} match to ${memberEmail} (now at ${matchesRemaining})`
  );

  return { memberEmail, matchesGranted, matchesRemaining };
}
