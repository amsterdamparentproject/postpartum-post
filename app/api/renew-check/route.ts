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
 *
 * Concurrency: deployed on Netlify (not Vercel — a synchronous function's
 * execution ceiling there is much tighter, and isn't fully in this route's
 * control), so candidates are processed in concurrent batches
 * (BATCH_CONCURRENCY below) rather than one at a time. At this project's
 * scale (dozens of members, capped around a hundred for the foreseeable
 * future — not the kind of volume that justifies a Netlify Background
 * Function, which would also mean the n8n job calling this stops getting a
 * real {checked, billed, errors} response body back), a handful of real
 * Stripe calls per candidate run one after another regardless — it's the
 * candidate *count* being processed serially that risked adding up past a
 * ~10-26s window, not any one candidate being slow. Revisit if the billable
 * population ever grows enough to change that math.
 *
 * Retry-safety: the n8n job calling this also has retryOnFail set, and a
 * slow batch can still plausibly get cut off by either side's timeout even
 * with the concurrency above — the per-candidate work already in flight
 * keeps running and completes server-side regardless. A retry after that
 * would re-query the same still-billable candidates (matches_remaining
 * isn't reset until the invoice.payment_succeeded webhook fires later,
 * Track E2) and, without the idempotency keys below, invoice them a second
 * time. Scoped to member + calendar month, not any Stripe-side transaction
 * id, so a genuine retry within the same billing cycle reuses the exact
 * same key (Stripe returns the original result, not a duplicate) while
 * next month's real invoice gets a fresh one.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

// Processed in batches of this size rather than unbounded — plenty of
// headroom over the current/expected member count to collapse total wall
// time, while still capping how many concurrent Stripe/Supabase calls this
// route ever opens at once.
const BATCH_CONCURRENCY = 20;

type RenewOutcome =
  | { kind: "billed" }
  | { kind: "skipped_no_payment_method" }
  | { kind: "no_op" }
  | { kind: "error"; memberId: string; error: string };

async function renewMember(
  member: { id: string },
  supabase: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  cycleKey: string
): Promise<RenewOutcome> {
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
      return { kind: "no_op" };
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
      return { kind: "skipped_no_payment_method" };
    }

    const price = stripeSub.items.data[0]?.price;
    if (!price || price.unit_amount === null) {
      return {
        kind: "error",
        memberId: member.id,
        error: `Subscription ${sub.stripe_subscription_id} has no simple unit_amount price to bill`,
      };
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
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        subscription: sub.stripe_subscription_id,
        amount: price.unit_amount,
        currency: price.currency,
        description: "Postpartum Post — renewal",
      },
      { idempotencyKey: `renew-check-item-${member.id}-${cycleKey}` }
    );

    await stripe.invoices.create(
      {
        customer: customerId,
        subscription: sub.stripe_subscription_id,
        auto_advance: true,
      },
      { idempotencyKey: `renew-check-invoice-${member.id}-${cycleKey}` }
    );

    return { kind: "billed" };
  } catch (e) {
    console.error(`[renew-check] Failed to renew member ${member.id}:`, e);
    return {
      kind: "error",
      memberId: member.id,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

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

  // See the retry-safety note in the docblock above.
  const cycleKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const list = candidates ?? [];
  for (let i = 0; i < list.length; i += BATCH_CONCURRENCY) {
    const batch = list.slice(i, i + BATCH_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((member) => renewMember(member, supabase, stripe, cycleKey))
    );
    for (const outcome of outcomes) {
      if (outcome.kind === "billed") billed++;
      else if (outcome.kind === "skipped_no_payment_method") skippedNoPaymentMethod++;
      else if (outcome.kind === "error") errors.push({ memberId: outcome.memberId, error: outcome.error });
      // "no_op" — no live subscription, nothing to count.
    }
  }

  return NextResponse.json({
    checked: candidates?.length ?? 0,
    billed,
    skippedNoPaymentMethod,
    errors,
  });
}
