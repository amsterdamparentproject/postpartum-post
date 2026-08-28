/**
 * Track C4 — what the member-facing match-reveal email says about billing,
 * per billing plan §3.3's notice-volume table, since revised (copy pass) to
 * drop the monthly "quiet" renewal reminder entirely — a monthly member
 * already knows what they signed up for, and the disclosure requirement is
 * satisfied at signup, not by a recurring reminder:
 *
 *   | Situation                          | Notice                              |
 *   |-------------------------------------|--------------------------------------|
 *   | End of a bundle term                | Loud — counter, date, amount, cancel |
 *   | First charge after a gift           | Loud — their first real charge       |
 *   | Monthly member's ordinary renewal   | None                                 |
 *   | Comped member                       | None                                 |
 *
 * Split in two, same shape as lib/member-status.ts (Track C1):
 *
 *   - deriveBillingNotice() is pure and synchronous — the tier logic,
 *     fully unit-testable without touching Supabase or Stripe.
 *   - fetchBillingNoticeContext() is the admin-context data fetch that
 *     feeds it, mirroring getSubscriptionDetails() (app/actions/profile.ts)
 *     but keyed directly by memberId — send-match-emails runs as a batch
 *     job with no per-member access token to authenticate a session with.
 *
 * The "first charge after a gift" distinction is read straight from the
 * match_entitlements ledger (the most recent term_payment row's `note`
 * column, tagged "gift" by the invoice.payment_succeeded webhook handler —
 * see lib/match-ledger.ts's GIFT_ENTITLEMENT_NOTE) rather than a live
 * Stripe call — that's the whole point of tagging it at payment time
 * instead of re-deriving it here.
 */

import { FYP_LOOKUP_KEYS, GIFT_ENTITLEMENT_NOTE } from "@/lib/match-ledger";
import { TERM_AMOUNTS } from "@/lib/member-status";
import { getStripe } from "@/lib/stripe";
import { SITE_URL } from "@/lib/emails/base";

type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

export type BillingNotice =
  // Comped (FYP) — no billing content in the reveal email at all. Also
  // what a monthly member always gets now (see doc comment above).
  | { kind: "none" }
  // Bundle member with matches left this term — the always-shown counter
  // line, not a renewal notice. matchesRemaining is always >= 1 here.
  // renewDate is set only at exactly 1 match left, and only when Stripe's
  // currentPeriodEnd is known — the real date the subscription will next
  // renew (interim source pre-Track E, same as lib/member-status.ts's
  // last-match dateTooltip), so the footer notice can name a real date
  // instead of vaguely gesturing at "soon."
  | { kind: "counter"; matchesRemaining: number; renewDate?: string }
  // Bundle member whose counter just hit zero this round — the term is
  // over, they're about to be charged. isFirstAfterGift distinguishes "your
  // gift just ended, this is your first real charge" from an ordinary
  // bundle running out; both get the full loud treatment (date, amount,
  // cancel link), just different framing in the template.
  | {
      kind: "loud";
      renewDate: string;
      amount: string | null;
      isFirstAfterGift: boolean;
      cancelUrl: string;
    };

export interface BillingNoticeInput {
  priceLookupKey: string | null;
  /** Stripe price recurring.interval_count. >1 means a bundle. */
  intervalCount: number | null;
  matchesRemaining: number;
  /** match_entitlements.note on the member's most recent term_payment row. */
  lastTermPaymentNote: string | null;
  /** Stripe's real current_period_end (unix seconds) — see
   *  lib/member-status.ts's MemberStatusInput.currentPeriodEnd for why:
   *  interim source for the renewal date until Track E1's renew-check job
   *  exists, since a fabricated calendar date doesn't match Stripe's own
   *  natural billing cycle pre-Track E. */
  currentPeriodEnd?: number | null;
  /** Injectable for tests — defaults to now. Currently unused by
   *  deriveBillingNotice's date logic (see currentPeriodEnd above); kept
   *  for callers and to avoid churning every call site's shape. */
  today?: Date;
}

function formatRenewDate(date: Date): string {
  return date.toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Distinct utm_content from the footer's own "Manage subscription" link
// (lib/emails/base.ts's emailFooter) so click-through on the renewal
// notice specifically is visible in analytics, separate from the footer
// link every transactional email already carries.
function renewalNoticeCancelUrl(): string {
  return `${SITE_URL}/billing?utm_source=email&utm_campaign=transactional&utm_content=renewal-notice`;
}

export function deriveBillingNotice(input: BillingNoticeInput): BillingNotice {
  const { priceLookupKey, intervalCount, matchesRemaining, lastTermPaymentNote, currentPeriodEnd } = input;

  if (priceLookupKey && FYP_LOOKUP_KEYS.has(priceLookupKey)) {
    return { kind: "none" };
  }

  const isBundle = (intervalCount ?? 1) > 1;

  // Copy pass: the monthly renewal reminder is retired — a monthly member
  // has nothing new to learn from an every-email "you'll be charged" line,
  // and dropping it also drops a line of unnecessary noise from every
  // single monthly member's reveal email.
  if (!isBundle) {
    return { kind: "none" };
  }

  const amount = priceLookupKey ? TERM_AMOUNTS[priceLookupKey] ?? null : null;
  // Real Stripe date, not a fabricated one — see BillingNoticeInput's
  // currentPeriodEnd doc comment. Only defined when known; the "loud"
  // branch falls back to "soon" itself, but the "counter" branch leaves it
  // undefined so the footer notice can omit the date gracefully instead.
  const periodEndDate = currentPeriodEnd ? formatRenewDate(new Date(currentPeriodEnd * 1000)) : undefined;

  if (matchesRemaining > 0) {
    return {
      kind: "counter",
      matchesRemaining,
      renewDate: matchesRemaining === 1 ? periodEndDate : undefined,
    };
  }

  return {
    kind: "loud",
    renewDate: periodEndDate ?? "soon",
    amount,
    isFirstAfterGift: lastTermPaymentNote === GIFT_ENTITLEMENT_NOTE,
    cancelUrl: renewalNoticeCancelUrl(),
  };
}

export interface BillingNoticeContext {
  priceLookupKey: string | null;
  intervalCount: number | null;
  lastTermPaymentNote: string | null;
  currentPeriodEnd: number | null;
}

/**
 * Admin-context fetch of the inputs deriveBillingNotice() needs, given a
 * bare memberId — no session/access token, since send-match-emails is a
 * batch job. Mirrors getSubscriptionDetails()'s query shape
 * (app/actions/profile.ts) without its requireMember() gate.
 *
 * Returns null when the member has no non-canceled subscription row —
 * callers should treat that the same as { kind: "none" } rather than
 * erroring the whole email send over it.
 */
export async function fetchBillingNoticeContext(
  supabase: AnySupabaseClient,
  memberId: string
): Promise<BillingNoticeContext | null> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", memberId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) return null;

  let priceLookupKey: string | null = null;
  let intervalCount: number | null = null;
  let currentPeriodEnd: number | null = null;
  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
      expand: ["items.data.price"],
    });
    const item = stripeSub.items.data[0];
    priceLookupKey = item?.price.lookup_key ?? null;
    intervalCount = item?.price.recurring?.interval_count ?? null;
    currentPeriodEnd = item?.current_period_end ?? null;
  } catch (e) {
    console.error("[billing-notice] Stripe subscription fetch failed:", e);
  }

  const { data: lastTermPayment } = await supabase
    .from("match_entitlements")
    .select("note")
    .eq("member_id", memberId)
    .eq("event", "term_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    priceLookupKey,
    intervalCount,
    lastTermPaymentNote: lastTermPayment?.note ?? null,
    currentPeriodEnd,
  };
}

/**
 * Combines fetchBillingNoticeContext()'s possibly-null result with
 * deriveBillingNotice(). A member with no non-canceled subscription row
 * gets { kind: "none" } explicitly here, rather than letting
 * deriveBillingNotice guess from null/null inputs — which would otherwise
 * fall through to the monthly "quiet" branch (isBundle defaults to false
 * when intervalCount is null), wrongly telling a member with no
 * subscription at all that they're renewing.
 */
export function resolveBillingNotice(
  context: BillingNoticeContext | null,
  matchesRemaining: number,
  today?: Date
): BillingNotice {
  if (!context) return { kind: "none" };
  return deriveBillingNotice({
    priceLookupKey: context.priceLookupKey,
    intervalCount: context.intervalCount,
    matchesRemaining,
    lastTermPaymentNote: context.lastTermPaymentNote,
    currentPeriodEnd: context.currentPeriodEnd,
    today,
  });
}
