import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { FYP_LOOKUP_KEYS } from "@/lib/match-ledger";

/**
 * POST /api/subscription-audit — daily, READ-ONLY fail-open check.
 *
 * Under the renew-at-0 model every chargeable Stripe subscription must rest
 * in `pause_collection`. Stripe's own scheduler charges any unpaused
 * subscription regardless of members.matches_remaining (the cause of the
 * Oct 5 early charges), so an unpaused one is a surprise charge waiting for
 * its next cycle date. This route lists those; it never writes to Stripe.
 *
 * Flagged = DB-live subscription whose Stripe status is active/trialing,
 * NOT paused, NOT FYP (separate billing path), NOT comped
 * (members.billing_mode 'comped_*' — free access whatever is on file, e.g. the
 * founder account or a future "app" cohort), chargeable (has a default
 * payment method), and with no payment already in flight.
 *
 * "Unpaused" is the normal state mid-renewal: renew-check clears the pause
 * before invoicing and the invoice.payment_succeeded webhook re-pauses. So a
 * subscription whose latest invoice is still open is NOT flagged; it is
 * reported separately:
 *   - inFlight:      open invoice, no retry scheduled (e.g. SEPA debit pending).
 *                    Promoted to `flagged` once older than STALE_IN_FLIGHT_DAYS.
 *   - paymentFailed: open invoice with a retry scheduled (a failed attempt).
 *                    Needs a human; alert on it.
 *
 * Each offender carries `matchesRemaining` and `nextChargeAt` so the alert
 * can be ranked: unpaused with matches left is the overcharge case.
 *
 * Auth: Bearer MATCHER_API_SECRET (same as renew-check). Intended caller: a
 * daily n8n cron; alert when `flaggedCount > 0`, `paymentFailed` is non-empty
 * or `errors` is non-empty.
 */

const BATCH_CONCURRENCY = 10;
// A SEPA debit can take up to 14 business days; past this, an open invoice is
// no longer "pending" and is flagged like any other unpaused subscription.
const STALE_IN_FLIGHT_DAYS = 21;

export type AuditFlag = {
  memberId: string;
  subscriptionId: string;
  stripeStatus: string;
  matchesRemaining: number | null;
  nextChargeAt: string | null;
};

export type InvoiceState = {
  memberId: string;
  subscriptionId: string;
  invoiceId: string;
  attemptCount: number;
  ageDays: number;
  nextPaymentAttempt: string | null;
};

type AuditMember = { id: string; matches_remaining: number | null; billing_mode?: string | null };

type AuditOutcome =
  | { kind: "flagged"; flag: AuditFlag }
  | { kind: "in_flight"; state: InvoiceState }
  | { kind: "payment_failed"; state: InvoiceState }
  | { kind: "ok" }
  | { kind: "skipped_fyp" }
  | { kind: "skipped_comped" }
  | { kind: "skipped_not_chargeable" }
  | { kind: "error"; subscriptionId: string; error: string };

export function classify(
  stripeSub: Stripe.Subscription,
  member: AuditMember,
  nowMs: number = Date.now()
): AuditOutcome {
  if (stripeSub.status !== "active" && stripeSub.status !== "trialing") return { kind: "ok" };
  if (stripeSub.pause_collection) return { kind: "ok" };

  const lookupKey = stripeSub.items?.data?.[0]?.price?.lookup_key;
  if (lookupKey && FYP_LOOKUP_KEYS.has(lookupKey)) return { kind: "skipped_fyp" };

  // Comped = free access regardless of any card on file. Checked before the
  // payment-method test, which only catches comped subs that have no card.
  if (member.billing_mode?.startsWith("comped")) return { kind: "skipped_comped" };

  const customer = stripeSub.customer;
  const customerObj = typeof customer !== "string" && customer && !customer.deleted ? customer : null;
  const hasPaymentMethod =
    stripeSub.default_payment_method ||
    customerObj?.invoice_settings?.default_payment_method ||
    customerObj?.default_source;
  if (!hasPaymentMethod) return { kind: "skipped_not_chargeable" };

  // Mid-renewal: an open latest invoice means renew-check (or Stripe's own
  // cycle) has already billed and the webhook will re-pause on success.
  const inv = stripeSub.latest_invoice;
  if (inv && typeof inv !== "string" && inv.status === "open") {
    const ageDays = Math.floor((nowMs / 1000 - inv.created) / 86400);
    const state: InvoiceState = {
      memberId: member.id,
      subscriptionId: stripeSub.id,
      invoiceId: inv.id ?? "",
      attemptCount: inv.attempt_count ?? 0,
      ageDays,
      nextPaymentAttempt: inv.next_payment_attempt
        ? new Date(inv.next_payment_attempt * 1000).toISOString()
        : null,
    };
    if (inv.next_payment_attempt) return { kind: "payment_failed", state };
    if (ageDays <= STALE_IN_FLIGHT_DAYS) return { kind: "in_flight", state };
    // stale: fall through and flag
  }

  const nextTs =
    stripeSub.status === "trialing" && stripeSub.trial_end
      ? stripeSub.trial_end
      : stripeSub.items?.data?.[0]?.current_period_end ?? null;

  return {
    kind: "flagged",
    flag: {
      memberId: member.id,
      subscriptionId: stripeSub.id,
      stripeStatus: stripeSub.status,
      matchesRemaining: member.matches_remaining,
      nextChargeAt: nextTs ? new Date(nextTs * 1000).toISOString() : null,
    },
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[subscription-audit] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const stripe = getStripe();

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, member_id, members!inner(id, matches_remaining, billing_mode)")
    .neq("status", "canceled");

  if (error) {
    console.error("[subscription-audit] Failed to load subscriptions:", error);
    return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
  }

  const list = (rows ?? []).filter((r) => r.stripe_subscription_id);
  const flagged: AuditFlag[] = [];
  const errors: { subscriptionId: string; error: string }[] = [];
  let ok = 0;
  let skippedFyp = 0;
  let skippedNotChargeable = 0;
  let skippedComped = 0;
  const inFlight: InvoiceState[] = [];
  const paymentFailed: InvoiceState[] = [];

  for (let i = 0; i < list.length; i += BATCH_CONCURRENCY) {
    const batch = list.slice(i, i + BATCH_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (row): Promise<AuditOutcome> => {
        const subId = row.stripe_subscription_id as string;
        try {
          const rel = row.members as unknown;
          const member = (Array.isArray(rel) ? rel[0] : rel) as AuditMember;
          const stripeSub = await stripe.subscriptions.retrieve(subId, {
            expand: ["customer", "items.data.price", "latest_invoice"],
          });
          return classify(stripeSub, member);
        } catch (e) {
          console.error(`[subscription-audit] Failed to audit ${subId}:`, e);
          return { kind: "error", subscriptionId: subId, error: e instanceof Error ? e.message : String(e) };
        }
      })
    );
    for (const o of outcomes) {
      if (o.kind === "flagged") flagged.push(o.flag);
      else if (o.kind === "ok") ok++;
      else if (o.kind === "skipped_fyp") skippedFyp++;
      else if (o.kind === "skipped_not_chargeable") skippedNotChargeable++;
      else if (o.kind === "skipped_comped") skippedComped++;
      else if (o.kind === "in_flight") inFlight.push(o.state);
      else if (o.kind === "payment_failed") paymentFailed.push(o.state);
      else errors.push({ subscriptionId: o.subscriptionId, error: o.error });
    }
  }

  if (paymentFailed.length > 0) {
    console.error(`[subscription-audit] ${paymentFailed.length} failed renewal payment(s)`, paymentFailed);
  }
  if (flagged.length > 0) {
    console.error(`[subscription-audit] ${flagged.length} unpaused chargeable subscription(s)`, flagged);
  }

  return NextResponse.json({
    checked: list.length,
    ok,
    skippedFyp,
    skippedNotChargeable,
    skippedComped,
    inFlight,
    paymentFailed,
    flaggedCount: flagged.length,
    flagged,
    errors,
  });
}
