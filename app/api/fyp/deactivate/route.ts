/**
 * POST /api/fyp/deactivate
 *
 * Backend counterpart to /api/fyp/activate — strips the Postpartum Post
 * comp discount from a linked member's subscription once their FYP access
 * has actually ended.
 *
 * Only ever needed for `planType: "monthly"` activations. Bundle comps are
 * self-expiring (a fixed-duration coupon pinned to bundle_expires_at at
 * activation time — see /api/fyp/activate), since a bundle's FYP term never
 * shortens early even on cancellation. Called from site's
 * app/api/webhooks/stripe/fyp/route.ts, exactly once, when Stripe's
 * `customer.subscription.deleted` event fires for a monthly FYP account —
 * not when cancellation is merely requested, so this naturally preserves
 * "comp lasts through 'canceling', stops at 'canceled'" without needing to
 * inspect FYP's own status at all.
 *
 * Removing a discount doesn't trigger prorations or generate an invoice on
 * its own (Stripe's docs: "the new discount is applied the next time the
 * subscription creates an invoice") — the member's next real invoice is
 * simply billed at full price going forward. No retroactive reconciliation
 * of the free period already given, same safety property relied on
 * throughout this integration.
 *
 * Idempotent: calling this for a member with no active subscription, or a
 * subscription with no discount attached, is a harmless no-op rather than
 * an error — safe to call more than once for the same member.
 *
 * Auth: Bearer token via FYP_DEACTIVATE_API_SECRET env var — a separate
 * secret from FYP_ACTIVATE_API_SECRET, matching this project's per-route
 * shared-secret convention (see /api/run-matcher's MATCHER_API_SECRET).
 *
 * Request body: { postpartumpostMemberId: string }
 * Response: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const secret = process.env.FYP_DEACTIVATE_API_SECRET;
  if (!secret) {
    console.error("[fyp deactivate] FYP_DEACTIVATE_API_SECRET is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let postpartumpostMemberId: string | undefined;
  try {
    ({ postpartumpostMemberId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!postpartumpostMemberId) {
    return NextResponse.json(
      { error: "Missing postpartumpostMemberId" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", postpartumpostMemberId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    // Nothing to deactivate — either never activated, or already handled.
    console.log(
      `[fyp deactivate] no active subscription for member ${postpartumpostMemberId}, nothing to do`,
    );
    return NextResponse.json({ ok: true });
  }

  const stripe = getStripe();
  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: "",
    });
    console.log(
      `[fyp deactivate] discount removed from subscription ${sub.stripe_subscription_id}`,
    );
  } catch (err) {
    console.error(
      `[fyp deactivate] failed to remove discount from subscription ${sub.stripe_subscription_id}:`,
      err,
    );
    return NextResponse.json(
      { error: "Failed to remove Postpartum Post discount" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
