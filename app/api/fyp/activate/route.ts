/**
 * POST /api/fyp/activate
 *
 * Backend for the First Year Program Hub's "Activate your Postpartum Post
 * subscription" button (site repo, /hub/account — see
 * site/__claude__/fyp-improvements-plan.md § 2 / § 2a). site's server calls
 * this with a parent's identity and their FYP plan shape; this route does
 * the lookup-or-create and returns a postpartumpost_member_id for site to
 * pin on that parent's firstyear.members row.
 *
 * - Existing PP member found (by email) -> comps them (see § "Existing
 *   members" below), then returns their id. Never creates a duplicate
 *   member row or Stripe customer for them.
 * - No existing PP member -> created synchronously, in this same request:
 *   a Stripe customer, a `standard_monthly` Stripe subscription with a
 *   100%-off coupon applied at creation (see § 2a below), a
 *   `postpartumpost.members` row, and a `postpartumpost.subscriptions` row.
 *
 * ── Redesign (2026-07-21), replacing the original trial_end approach ──────
 * The original version of this route set `trial_end` to the 1st of next
 * month and relied on a monthly comp-sync sweep (grantFreeMonth) to keep
 * extending it. That design was scrapped before the sweep was ever built:
 * walking through it surfaced that PP's own /billing page reads
 * subscription.pause_collection to show "Skipping this month" — the exact
 * mechanism the sweep would have used — which would misrepresent an
 * indefinite FYP-linked benefit as a recurring choice to skip, and made
 * correctness depend on a monthly job succeeding forever (the unsafe
 * failure direction: a missed run bills the member for real).
 *
 * Replaced with a 100%-off Stripe coupon applied directly via
 * `discounts: [...]` — no trial_end at all. Confirmed via Stripe's docs
 * that adding/removing a discount "doesn't incur prorations or generate an
 * invoice on its own," unlike trial_end/.update(), so this doesn't
 * reintroduce the stub-invoice/re-invoice bug covered in
 * __claude__/billing-extension-bugfix-plan.md — it's a structurally
 * different, forward-only mechanism. Same shape PP's own gift-card flow
 * already uses (lib/gift-cards.ts: percent_off 100, duration/duration_in_months,
 * applies_to a specific product) — not new territory for this codebase.
 *
 * - `planType: "monthly"` -> a single reusable coupon
 *   (`FYP_COMP_COUPON_ID` env var, `duration: "forever"`, pre-created
 *   manually in the Stripe Dashboard — same convention as
 *   `STRIPE_FYP_DEPOSIT_COUPON_ID` on the site side). Revoked later, once,
 *   when FYP access actually ends (site's FYP webhook calls
 *   /api/fyp/deactivate — see that route).
 * - `planType: "bundle"` -> a coupon keyed on `duration_in_months`, computed
 *   from *now* through the account's `bundleExpiresAt` (site owns this date,
 *   passed in the request body). Self-expiring — no revoke call ever needed
 *   for bundles, since a bundle's FYP term never shortens early even on
 *   cancellation (already fully paid). Confirmed intentional (2026-07-21)
 *   that this can grant more than 6 months for expecting-flow bundles that
 *   activate during pregnancy, since PP access is explicitly allowed to
 *   start before the FYP term's own billing_start_date — "it's an expecting
 *   perk."
 *
 *   Reused (2026-07-22) rather than created fresh per activation: the
 *   coupon id is deterministic (`fyp-bundle-{months}mo`), so every family
 *   landing on the same duration_in_months shares one Dashboard row instead
 *   of each activation littering a new random-id coupon. Bounded in
 *   practice — at most ~9 months of pregnancy plus the fixed 6-month bundle
 *   term means duration_in_months tops out around 15, so this settles into
 *   a small, stable set of coupons (max 15) rather than growing unbounded.
 *   See getOrCreateBundleCoupon() below.
 *
 * ── Existing members (2026-07-22) ──────────────────────────────────────────
 * Check their most recent subscription row (regardless of its status — status 
 * alone isn't enough to tell "still-live Stripe subscription" from "genuinely 
 * ended," see TERMINAL_SUBSCRIPTION_STATUSES below) and either:
 *
 * - a still-live subscription exists -> apply the same coupon selection as
 *   above directly to it via `stripe.subscriptions.update(..., { discounts
 *   })`, no new Stripe objects at all.
 * - no live subscription (never subscribed, or one that's genuinely
 *   canceled/inactive/abandoned) -> create a fresh comped subscription, but
 *   for their *existing* Stripe customer — never a new one. This reuses
 *   `existing.stripe_customer_id` rather than calling
 *   `stripe.customers.create()`, so a person who already has a
 *   `postpartumpost.members` row never ends up with two.
 *
 * Auth: Bearer token via FYP_ACTIVATE_API_SECRET env var — same per-route
 * shared-secret convention as /api/run-matcher (MATCHER_API_SECRET).
 *
 * Request body: {
 *   email: string, firstName: string, lastName: string,
 *   planType: "monthly" | "bundle",
 *   bundleExpiresAt?: string  // YYYY-MM-DD, required when planType === "bundle"
 * }
 * Response: { postpartumpost_member_id: string, created: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

/**
 * Whole calendar months between "now" and a YYYY-MM-DD target date, rounded
 * up so the coupon always covers at least through that date (never short —
 * granting a few extra days/months is accepted, per the "it's a perk" call).
 * Always at least 1, so a bundle activated right at (or past) its own
 * bundle_expires_at doesn't produce an invalid 0-month coupon.
 */
function monthsUntil(targetDateStr: string): number {
  const now = new Date();
  const target = new Date(`${targetDateStr}T00:00:00.000Z`);
  const months =
    (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - now.getUTCMonth()) +
    (target.getUTCDate() > now.getUTCDate() ? 1 : 0);
  return Math.max(1, months);
}

/** Deterministic id shared by every bundle activation with this duration. */
function bundleCouponId(months: number): string {
  return `fyp-bundle-${months}mo`;
}

function isMissingCouponError(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeError &&
    err.statusCode === 404 &&
    err.code === "resource_missing"
  );
}

/**
 * Looks up the shared bundle coupon for this exact duration, creating it
 * the first time that duration is seen. Reuse — not creation — is the
 * common case after a duration's first activation: Stripe's own redemption
 * count on that one coupon then reflects every family who shared it,
 * instead of each activation showing up as its own one-redemption row in
 * the Dashboard. See the route docblock above for why the set of possible
 * durations is small and bounded.
 */
async function getOrCreateBundleCoupon(
  stripe: Stripe,
  months: number,
  productId: string,
): Promise<string> {
  const id = bundleCouponId(months);
  try {
    const existing = await stripe.coupons.retrieve(id);
    return existing.id;
  } catch (err) {
    if (!isMissingCouponError(err)) throw err;
  }
  const coupon = await stripe.coupons.create({
    id,
    name: `Postpartum Post for FYP bundle — ${months} months`,
    percent_off: 100,
    duration: "repeating",
    duration_in_months: months,
    applies_to: { products: [productId] },
    metadata: { product: "fyp_bundle_comp" },
  });
  return coupon.id;
}

/** Fetches the standard_monthly Price (with its Product expanded). */
async function fetchStandardMonthlyPrice(
  stripe: Stripe,
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({
    lookup_keys: ["standard_monthly"],
    expand: ["data.product"],
  });
  return prices.data[0] ?? null;
}

function productIdFromPrice(price: Stripe.Price): string {
  return typeof price.product === "string" ? price.product : price.product.id;
}

/**
 * Resolves the coupon id for a given plan type. `productId` is only used
 * for bundle plans (getOrCreateBundleCoupon scopes the coupon to it) — pass
 * whatever's on hand for monthly plans, it's ignored. Returns null if
 * FYP_COMP_COUPON_ID isn't configured for a monthly plan; callers turn that
 * into a 500.
 */
async function resolveCouponId(
  stripe: Stripe,
  planType: string,
  bundleExpiresAt: string | undefined,
  productId: string,
): Promise<string | null> {
  if (planType === "monthly") {
    return process.env.FYP_COMP_COUPON_ID ?? null;
  }
  return getOrCreateBundleCoupon(
    stripe,
    monthsUntil(bundleExpiresAt!),
    productId,
  );
}

// Subscription-row statuses that mean "no live Stripe subscription exists
// for this member" — see app/actions/profile.ts's status union and
// app/api/monthly-response/route.ts / e2e/abandoned-checkout.spec.ts for
// where each of these gets set. Anything NOT in this set (active, paused,
// canceling, pending, ...) is treated as still-live: safer to attempt an
// update (which fails loudly if that assumption is ever wrong) than to risk
// creating a second, duplicate-billing subscription for the same customer.
const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "inactive",
  "abandoned",
]);

export async function POST(req: NextRequest) {
  const secret = process.env.FYP_ACTIVATE_API_SECRET;
  if (!secret) {
    console.error("[fyp activate] FYP_ACTIVATE_API_SECRET is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let email: string | undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let planType: string | undefined;
  let bundleExpiresAt: string | undefined;
  try {
    ({ email, firstName, lastName, planType, bundleExpiresAt } =
      await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!email || !firstName || !lastName) {
    return NextResponse.json(
      { error: "Missing email, firstName, or lastName" },
      { status: 400 },
    );
  }

  if (planType !== "monthly" && planType !== "bundle") {
    return NextResponse.json(
      { error: "planType must be 'monthly' or 'bundle'" },
      { status: 400 },
    );
  }

  if (planType === "bundle" && !bundleExpiresAt) {
    return NextResponse.json(
      { error: "bundleExpiresAt is required when planType is 'bundle'" },
      { status: 400 },
    );
  }

  const normalizedEmail = email.toLowerCase();
  const supabase = createAdminClient();
  const stripe = getStripe();

  // ── Existing PP member? Comp them, then return — never a new member row. ──
  const { data: existing } = await supabase
    .from("members")
    .select("id, stripe_customer_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing) {
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("member_id", existing.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasLiveSubscription =
      !!existingSub?.stripe_subscription_id &&
      !TERMINAL_SUBSCRIPTION_STATUSES.has(existingSub.status);

    if (hasLiveSubscription) {
      // Already paying (or already comped) — apply the discount to their
      // current subscription rather than leaving it untouched.
      const price = await fetchStandardMonthlyPrice(stripe);
      if (!price) {
        return NextResponse.json(
          { error: "standard_monthly price not found in Stripe" },
          { status: 500 },
        );
      }
      const couponId = await resolveCouponId(
        stripe,
        planType,
        bundleExpiresAt,
        productIdFromPrice(price),
      );
      if (!couponId) {
        console.error("[fyp activate] FYP_COMP_COUPON_ID is not set");
        return NextResponse.json(
          { error: "Server misconfiguration" },
          { status: 500 },
        );
      }

      try {
        await stripe.subscriptions.update(existingSub!.stripe_subscription_id, {
          discounts: [{ coupon: couponId }],
        });
      } catch (err) {
        console.error(
          `[fyp activate] failed to comp existing member ${existing.id}'s subscription ${existingSub!.stripe_subscription_id}:`,
          err,
        );
        return NextResponse.json(
          { error: "Failed to apply Postpartum Post comp" },
          { status: 500 },
        );
      }
    } else if (existing.stripe_customer_id) {
      // No live subscription (never subscribed, or a genuinely ended one) —
      // give them a fresh comped subscription, but for their EXISTING
      // Stripe customer. Never stripe.customers.create() here: that would
      // leave this member with two Stripe customers for one PP account.
      const price = await fetchStandardMonthlyPrice(stripe);
      if (!price) {
        return NextResponse.json(
          { error: "standard_monthly price not found in Stripe" },
          { status: 500 },
        );
      }
      const couponId = await resolveCouponId(
        stripe,
        planType,
        bundleExpiresAt,
        productIdFromPrice(price),
      );
      if (!couponId) {
        console.error("[fyp activate] FYP_COMP_COUPON_ID is not set");
        return NextResponse.json(
          { error: "Server misconfiguration" },
          { status: 500 },
        );
      }

      try {
        const subscription = await stripe.subscriptions.create({
          customer: existing.stripe_customer_id,
          items: [{ price: price.id }],
          discounts: [{ coupon: couponId }],
        });
        const { error: subError } = await supabase
          .from("subscriptions")
          .insert({
            member_id: existing.id,
            stripe_subscription_id: subscription.id,
            stripe_price_id: price.id,
            status: "active",
          });
        if (subError) {
          console.error(
            "[fyp activate] subscription insert failed for existing member (Stripe subscription still created):",
            JSON.stringify(subError),
          );
        }
      } catch (err) {
        console.error(
          `[fyp activate] failed to create comped subscription for existing member ${existing.id}:`,
          err,
        );
        return NextResponse.json(
          { error: "Failed to create Postpartum Post subscription" },
          { status: 500 },
        );
      }
    } else {
      // No stripe_customer_id at all — shouldn't happen for a real member
      // row, but don't block the link over it; just log loudly.
      console.error(
        `[fyp activate] existing member ${existing.id} has no stripe_customer_id — can't comp`,
      );
    }

    return NextResponse.json({
      postpartumpost_member_id: existing.id,
      created: false,
    });
  }

  // ── No existing member — create customer, subscription, member, sub row ──
  const price = await fetchStandardMonthlyPrice(stripe);
  if (!price) {
    return NextResponse.json(
      { error: "standard_monthly price not found in Stripe" },
      { status: 500 },
    );
  }
  const productId = productIdFromPrice(price);

  const couponId = await resolveCouponId(
    stripe,
    planType,
    bundleExpiresAt,
    productId,
  );
  if (!couponId) {
    console.error("[fyp activate] FYP_COMP_COUPON_ID is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const customer = await stripe.customers.create({
    email: normalizedEmail,
    name: `${firstName} ${lastName}`,
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    discounts: [{ coupon: couponId }],
  });

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      status: "active",
      stripe_customer_id: customer.id,
    })
    .select("id")
    .single();

  if (memberError || !member) {
    // Race: another request created this email between our lookup and insert.
    if (memberError?.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("members")
        .select("id")
        .eq("email", normalizedEmail)
        .single();
      if (raceWinner) {
        return NextResponse.json({
          postpartumpost_member_id: raceWinner.id,
          created: false,
        });
      }
    }
    console.error(
      "[fyp activate] member insert failed:",
      JSON.stringify(memberError),
    );
    return NextResponse.json(
      { error: "Failed to create Postpartum Post member" },
      { status: 500 },
    );
  }

  const { error: subError } = await supabase.from("subscriptions").insert({
    member_id: member.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: price.id,
    status: "active",
  });

  if (subError) {
    // Member + Stripe objects already exist — log loudly rather than fail
    // the request, since the member row (the thing site needs to pin) is
    // already committed. A missing subscriptions row would only surface
    // later, as "No active subscription found" from grantFreeMonth().
    console.error(
      "[fyp activate] subscription insert failed (member still created):",
      JSON.stringify(subError),
    );
  }

  return NextResponse.json({
    postpartumpost_member_id: member.id,
    created: true,
  });
}
