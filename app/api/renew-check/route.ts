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
 * For every ACTIVE member sitting at matches_remaining <= 0: clear
 * pause_collection and build the refill invoice by hand
 * (invoiceItems.create + invoices.create), exactly as rehearsed against a
 * real Stripe test clock in scripts/rehearse-track-d.mts (cases 2/3/5/6).
 * This route only SUBMITS the charge — granting the +N and re-pausing the
 * subscription both happen later, via the existing invoice.payment_succeeded
 * webhook handler (Track E2), whenever Stripe actually confirms payment.
 * That's deliberate: Track D confirmed invoice.paid fires on SETTLEMENT,
 * not submission, so this route has no business waiting around for it.
 *
 * A CANCELING member sitting at matches_remaining <= 0 is never billed —
 * they've already told us they don't want to renew, so a fresh charge
 * would silently override that. Instead this route finalizes the
 * cancellation directly: stripe.subscriptions.cancel() right now, rather
 * than waiting on Stripe's own cancel_at_period_end. That wait would
 * never resolve on its own under Track E2's model — a subscription sits
 * paused indefinitely between renewals, and nothing but this route ever
 * touches it again, so its natural period-end (which cancel_at_period_end
 * is scheduled against) would never actually arrive. The explicit cancel
 * call fires customer.subscription.deleted immediately, and the existing
 * webhook handler for that event already does the rest correctly —
 * members.status -> inactive, the unsubscribed email — so there's nothing
 * more to do here once the cancel call succeeds.
 *
 * Payment-method guard (plan §5 / Appendix A): a member with no
 * default_payment_method (the FYP/comped population) is skipped entirely —
 * no pause, no invoice, no cancellation. Touching pause_collection for
 * them would strand them at zero silently, since nothing would ever
 * unpause them.
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
 *     canceled: number,
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
 * id — but that only protects retries within Stripe's actual idempotency
 * window, which is 24 hours from the first request, not the whole billing
 * cycle (https://docs.stripe.com/error-low-level#idempotency: "keys expire
 * out of the system after 24 hours"). n8n's own retryOnFail, or you
 * re-running this by hand the same day, safely replays the same key and
 * gets the original result back. A manual re-run more than 24 hours after
 * a failed/partial run — e.g. noticing a broken batch days later — is NOT
 * covered: Stripe no longer recognizes the key and will create a genuine
 * second invoice item + invoice for anyone re-processed. Re-run same-day
 * only; past that, check for an existing uninvoiced state by hand first.
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
  | { kind: "canceled" }
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

/**
 * A "canceling" member who has used up their term (matches_remaining <= 0)
 * has already told us they don't want to renew — finalize the cancellation
 * now rather than waiting on Stripe's own cancel_at_period_end, which never
 * fires on its own under Track E2's pause model (see this file's top
 * docblock). stripe.subscriptions.cancel() triggers
 * customer.subscription.deleted immediately; that webhook already sets
 * members.status to "inactive" and sends the unsubscribed email, so this
 * function's only job is to make the cancel call — explicitly with
 * invoice_now: false and prorate: false, since Stripe's cancel endpoint
 * can otherwise generate its own "final invoice" for unbilled items or
 * pending prorations as a side effect of cancellation itself, which is
 * exactly the unwanted charge this whole function exists to prevent.
 */
async function finalizeCancellation(
  member: { id: string },
  supabase: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>
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
      // No live subscription to cancel — nothing to do.
      return { kind: "no_op" };
    }

    // Stripe's cancel endpoint can generate its own "final invoice" for any
    // unbilled usage or pending proration, independent of anything this
    // route does — confirmed against real Stripe test mode via
    // scripts/smoketest-renew-check.mts, which caught exactly this: a
    // trialing subscription with nothing ever billed still got a final
    // invoice on a bare cancel() call. That's the opposite of this
    // function's entire point (no bill, just cancel), so both are passed
    // explicitly rather than trusted to their documented defaults.
    await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
      invoice_now: false,
      prorate: false,
    });
    return { kind: "canceled" };
  } catch (e) {
    console.error(`[renew-check] Failed to finalize cancellation for member ${member.id}:`, e);
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
  // Find members sitting at zero or below who need SOME action this month —
  // active members get billed (see renewMember), canceling members get
  // their cancellation finalized instead (see finalizeCancellation). Both
  // need catching here since Track E2's pause model means nothing else
  // will ever revisit either group on its own.
  // -------------------------------------------------------------------------
  const { data: candidates, error: candidatesError } = await supabase
    .from("members")
    .select("id, status, matches_remaining")
    .in("status", ["active", "canceling"])
    .lte("matches_remaining", 0);

  if (candidatesError) {
    console.error("[renew-check] Failed to load candidate members:", candidatesError);
    return NextResponse.json({ error: "Failed to load candidate members" }, { status: 500 });
  }

  let billed = 0;
  let canceled = 0;
  let skippedNoPaymentMethod = 0;
  const errors: { memberId: string; error: string }[] = [];

  // See the retry-safety note in the docblock above.
  const cycleKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const list = candidates ?? [];
  for (let i = 0; i < list.length; i += BATCH_CONCURRENCY) {
    const batch = list.slice(i, i + BATCH_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((member) =>
        member.status === "canceling"
          ? finalizeCancellation(member, supabase, stripe)
          : renewMember(member, supabase, stripe, cycleKey)
      )
    );
    for (const outcome of outcomes) {
      if (outcome.kind === "billed") billed++;
      else if (outcome.kind === "canceled") canceled++;
      else if (outcome.kind === "skipped_no_payment_method") skippedNoPaymentMethod++;
      else if (outcome.kind === "error") errors.push({ memberId: outcome.memberId, error: outcome.error });
      // "no_op" — no live subscription, nothing to count.
    }
  }

  return NextResponse.json({
    checked: candidates?.length ?? 0,
    billed,
    canceled,
    skippedNoPaymentMethod,
    errors,
  });
}
