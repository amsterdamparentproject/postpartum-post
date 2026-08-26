/**
 * Shared helpers for the billing simplification plan's match_entitlements
 * ledger (migration 022) — see __claude__/billing-simplification-plan.md.
 *
 * recordEntitlement() is the one JS-side entry point for writing a fact;
 * the atomicity and replay-safety live in the record_entitlement() Postgres
 * function itself (migration 022), not here.
 */

type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

export type EntitlementEvent =
  | "term_payment"
  | "match_delivered"
  | "no_response"
  | "manual_grant"
  | "manual_backfill"
  | "payment_failed"
  | "canceled";

export interface RecordEntitlementParams {
  memberId: string;
  event: EntitlementEvent;
  delta: number;
  month?: string | null;
  matchId?: string | null;
  stripeInvoiceId?: string | null;
  note?: string | null;
}

/**
 * Writes one match_entitlements row and bumps members.matches_remaining,
 * atomically, via the record_entitlement() Postgres function. Returns
 * false — not an error — when the write was rejected as a duplicate: a
 * replayed Stripe invoice, or a second decrement for the same member in
 * the same month from any cause (see the plan's §3.1 invariants).
 */
export async function recordEntitlement(
  supabase: AnySupabaseClient,
  params: RecordEntitlementParams
): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_entitlement", {
    p_member_id: params.memberId,
    p_event: params.event,
    p_delta: params.delta,
    p_month: params.month ?? null,
    p_match_id: params.matchId ?? null,
    p_stripe_invoice_id: params.stripeInvoiceId ?? null,
    p_note: params.note ?? null,
  });
  if (error) throw new Error(`recordEntitlement failed: ${error.message}`);
  return data as boolean;
}

/**
 * FYP's own €55/month product shares this Stripe account but is out of
 * scope for the counter (plan §4, §5) — excluded from backfill and refill.
 */
export const FYP_LOOKUP_KEYS = new Set(["fyp_monthly_single", "fyp_monthly_multi"]);

/**
 * match_entitlements.note value written by the invoice.payment_succeeded
 * handler when a term_payment's invoice was gift-covered (Track C4) — a
 * 100%-off coupon tagged metadata.product === "gift_card" by
 * createGiftCard(), the only coupon type this app creates. Read back by
 * send-match-emails to tell "first real charge after a gift" apart from
 * an ordinary bundle running out (billing plan §3.3's notice-volume
 * table) — purely from this ledger, no Stripe calls at reveal time.
 */
export const GIFT_ENTITLEMENT_NOTE = "gift";

/**
 * Counts round dates (the "5th" of each month — matching match_rounds'
 * first-of-month `month` convention) in the half-open interval
 * [today, termEnd). See plan §4 — this is the forward derivation used to
 * seed matches_remaining at cutover, and matches the plan's own worked
 * table exactly (see __tests__/lib/match-ledger.test.ts).
 */
export function countRoundsRemaining(today: Date, termEnd: Date): number {
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  let candidate = new Date(Date.UTC(year, month, 5));
  if (candidate < today) {
    month += 1;
    candidate = new Date(Date.UTC(year, month, 5));
  }

  let count = 0;
  while (candidate < termEnd) {
    count++;
    month += 1;
    candidate = new Date(Date.UTC(year, month, 5));
  }
  return count;
}

/**
 * term_end per §4: trial_end is only trustworthy while status is
 * 'trialing'. Reading it unconditionally would seed 0 for most of the
 * member base — sixteen Founding Members carry a stale trial_end in the
 * past while status is 'active' (appendix A).
 */
export function deriveTermEnd(subscription: {
  status: string;
  trial_end: number | null;
  items: { data: Array<{ current_period_end: number }> };
}): Date | null {
  const termEndTs =
    subscription.status === "trialing"
      ? subscription.trial_end
      : subscription.items.data[0]?.current_period_end;
  return termEndTs ? new Date(termEndTs * 1000) : null;
}
