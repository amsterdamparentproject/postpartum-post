/**
 * POST /api/renew-check
 *
 * Billing simplification Track E1 (__claude__/billing-simplification-plan.md
 * §"Track E — cutover", §"Renewal timing"). Runs monthly on the 10th —
 * moved up from the plan's original 15th once Track D's SEPA findings
 * showed the 15th left almost no runway for a SEPA settlement (up to 14
 * business days) to clear before the next round's 5th opt-in deadline.
 * The 10th still leaves a 3-day gap after the 7th match-reveal notice —
 * above Stripe's own 2-day SEPA mandate floor — while giving a SEPA
 * charge until roughly the 29th/30th to settle, comfortably ahead of the
 * next deadline.
 *
 * For every billable member sitting at matches_remaining <= 0: clear
 * pause_collection and build the refill invoice by hand
 * (invoiceItems.create + invoices.create), exactly as rehearsed against a
 * real Stripe test clock in scripts/rehearse-track-d.mts (cases 2/3/5/6).
 * This route only SUBMITS the charge — granting the +N and re-pausing the
 * subscription both happen later, via the existing invoice.payment_succeeded
 * webhook handler (Track E2), whenever Stripe actually confirms payment.
 * That's deliberate: Track D confirmed invoice.paid fires on SETTLEMENT,
 * not submission, so this route has no business waiting around for it.
 *
 * Payment-method guard (plan §5 / Appendix A): a member with no
 * default_payment_method (the FYP/comped population) is skipped entirely —
 * no pause, no invoice. Touching pause_collection for them would strand
 * them at zero silently, since nothing would ever unpause them.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var, same as
 * the other job endpoints (commit-matches, run-matcher, send-optin-email).
 *
 * Request body: none required.
 *
 * Response:
 *   {
 *     checked: number,
 *     billed: number,
 *     skippedNoPaymentMethod: number,
 *     errors: Array<{ memberId: string, error: string }>
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[renew-check] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const stripe = getStripe();

  // -------------------------------------------------------------------------
  // Find billable members: currently paying (active, or canceling — paid
  // through period end and still eligible), sitting at zero or below.
  // Mirrors the billable-members filter in commit-matches/route.ts.
  // -------------------------------------------------------------------------
  const { data: candidates, error: candidatesError } = await supabase
    .from("members")
    .select("id, matches_remaining")
    .in("status", ["active", "canceling"])
    .lte("matches_remaining", 0);

  if (candidatesError) {
    console.error("[renew-check] Failed to load candidate members:", candidatesError);
    return NextResponse.json({ error: "Failed to load candidate members" }, { status: 500 });
  }

  let billed = 0;
  let skippedNoPaymentMethod = 0;
  const errors: { memberId: string; error: string }[] = [];

  for (const member of candidates ?? []) {
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("member_id", member.id)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub?.stripe_subscription_id) {
        // No live subscription to renew — nothing to do.
        continue;
      }

      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
        expand: ["items.data.price", "customer"],
      });

      const customer = stripeSub.customer;
      const customerId = typeof customer === "string" ? customer : customer.id;
      const defaultPaymentMethod =
        typeof customer !== "string" && !customer.deleted
          ? customer.invoice_settings?.default_payment_method
          : undefined;

      // Payment-method guard (plan §5 / Appendix A) — the FYP/comped
      // population. Never pause or bill a subscription with no default
      // payment method; it would strand them at zero silently.
      if (!defaultPaymentMethod) {
        skippedNoPaymentMethod++;
        continue;
      }

      const price = stripeSub.items.data[0]?.price;
      if (!price || price.unit_amount === null) {
        errors.push({
          memberId: member.id,
          error: `Subscription ${sub.stripe_subscription_id} has no simple unit_amount price to bill`,
        });
        continue;
      }

      // Clear pause_collection first — building the invoice below does the
      // actual charging; clearing pause_collection alone bills nothing
      // (confirmed, Track D case 1).
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: null,
      });

      // Flat amount + currency, not a price reference — invoiceItems.create
      // rejects a recurring price (confirmed, Track D). No
      // pending_invoice_items_behavior — it conflicts with `subscription`
      // on invoices.create (also confirmed, Track D); `subscription` alone
      // already pulls in this item.
      await stripe.invoiceItems.create({
        customer: customerId,
        subscription: sub.stripe_subscription_id,
        amount: price.unit_amount,
        currency: price.currency,
        description: "Postpartum Post — renewal",
      });

      await stripe.invoices.create({
        customer: customerId,
        subscription: sub.stripe_subscription_id,
        auto_advance: true,
      });

      billed++;
    } catch (e) {
      console.error(`[renew-check] Failed to renew member ${member.id}:`, e);
      errors.push({
        memberId: member.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    checked: candidates?.length ?? 0,
    billed,
    skippedNoPaymentMethod,
    errors,
  });
}
