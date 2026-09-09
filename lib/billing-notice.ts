/**
 * Track C4 — what the member-facing match-reveal email says about billing,
 * per billing plan §3.3's notice-volume table, since revised (copy pass,
 * 2026-08-27) to drop the monthly "quiet" renewal reminder entirely — a
 * monthly member already knows what they signed up for, and Dutch
 * auto-renewal law's disclosure requirement is satisfied at signup, not
 * by a recurring reminder (SEPA pre-notification is handled separately,
 * by Stripe's own mandate mechanics, not this email):
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
import { TERM_AMOUNTS, nextRenewCheckDate, renewCheckDateAfterNextRound } from "@/lib/member-status";
import { getStripe } from "@/lib/stripe";
import { SITE_URL } from "@/lib/emails/base";

type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

export type BillingNotice =
  // Comped (FYP) — no billing content in the reveal email at all.
  | { kind: "none" }
  // Bundle member with matches left this term — the always-shown counter
  // line, not a renewal notice. matchesRemaining is always >= 1 here.
  // renewDate is set only at exactly 1 match left: the date the member's
  // *next* renew-check will land on — next month's 10th, since their last
  // match goes out in next month's round before they hit zero (see
  // renewCheckDateAfterNextRound's doc comment) — surfaced so the
  // last-match footer line can name a real date instead of vaguely
  // gesturing at "after next month's match."
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
  /** Injectable for tests — defaults to now. */
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
  const { priceLookupKey, intervalCount, matchesRemaining, lastTermPaymentNote } = input;
  const today = input.today ?? new Date();

  if (priceLookupKey && FYP_LOOKUP_KEYS.has(priceLookupKey)) {
    return { kind: "none" };
  }

  const isBundle = (intervalCount ?? 1) > 1;

  // Copy pass, 2026-08-27: the monthly renewal reminder is retired — a
  // monthly member has nothing new to learn from an every-email "you'll
  // be charged" line, and dropping it also drops a line of legally
  // unnecessary noise from every single monthly member's reveal email.
  if (!isBundle) {
    return { kind: "none" };
  }

  const amount = priceLookupKey ? TERM_AMOUNTS[priceLookupKey] ?? null : null;

  if (matchesRemaining > 0) {
    const renewDate =
      matchesRemaining === 1 ? formatRenewDate(renewCheckDateAfterNextRound(today)) : undefined;
    return { kind: "counter", matchesRemaining, renewDate };
  }

  return {
    kind: "loud",
    renewDate: formatRenewDate(nextRenewCheckDate(today)),
    amount,
    isFirstAfterGift: lastTermPaymentNote === GIFT_ENTITLEMENT_NOTE,
    cancelUrl: renewalNoticeCancelUrl(),
  };
}

export interface BillingNoticeContext {
  priceLookupKey: string | null;
  intervalCount: number | null;
  lastTermPaymentNote: string | null;
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
  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
      expand: ["items.data.price"],
    });
    const item = stripeSub.items.data[0];
    priceLookupKey = item?.price.lookup_key ?? null;
    intervalCount = item?.price.recurring?.interval_count ?? null;
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
  };
}

/**
 * Combines fetchBillingNoticeContext()'s possibly-null result with
 * deriveBillingNotice(). A member with no non-canceled subscription row
 * gets { kind: "none" } explicitly here rather than letting
 * deriveBillingNotice guess from null/null inputs — both paths land on
 * "none" today (isBundle defaults to false when intervalCount is null,
 * and non-bundle now always means "none"), but keeping the explicit check
 * makes the "no subscription" case obvious at the call site rather than
 * relying on that being deriveBillingNotice's current default behavior.
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
    today,
  });
}
