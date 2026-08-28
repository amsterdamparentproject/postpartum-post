import { FYP_LOOKUP_KEYS } from "@/lib/match-ledger";

/**
 * Our own member-facing billing-status vocabulary — billing plan §3.3,
 * Track C1. "Stripe's subscription status is never shown to a member."
 *
 * Stripe's raw subscription status is still read here (it's the only place
 * that knows about payment health before Track E's cutover replaces
 * `subscriptions.status` with our own active/payment_failed/canceled
 * lifecycle) but it never reaches the member directly — this function is
 * the one translation point from Stripe's vocabulary to ours.
 *
 * Zero-counter renewal date (interim, pre-Track E): this used to compute a
 * fabricated date from a hardcoded "20th of the month" formula describing
 * Track E1's renew-check job — but that job doesn't exist yet, and won't
 * until Track E ships (held back pending Track B5's real-data check).
 * Until then, a subscription still renews on Stripe's own natural billing
 * cycle, so this shows that real date (currentPeriodEnd, the same Stripe
 * value already used a few rows down on /billing for "Next billing date")
 * instead. Once Track E1 exists and explicitly owns renewal timing, this
 * goes back to a predictable calendar-based date — see the held-back
 * feature/match-counter-subscriptions branch for that version.
 */

export type StatusTone = "active" | "info" | "warning" | "muted";

export type MemberStatusMessage = {
  label: string;
  tone: StatusTone;
  /**
   * Explanatory tooltip for an alert icon next to the "Next billing date"
   * row on /billing. Currently populated only for the last-match-of-a-
   * bundle state, where the short pill omits the "why"/"when" detail.
   */
  dateTooltip?: string;
  /**
   * Explanatory tooltip for an alert icon next to the /billing "Plan" row
   * — currently just the FYP/comped state, where the pill itself reads a
   * plain "Active" (matching every other active member) and the "this is
   * a comped First Year Program plan" explanation moves to the Plan row
   * instead.
   */
  planTooltip?: string;
};

export type MemberStatusInput = {
  /** Raw Stripe subscription status (active/trialing/past_due/incomplete/
   *  incomplete_expired/unpaid/canceled) — read but never surfaced as-is. */
  stripeStatus: string;
  priceLookupKey: string | null;
  /** Stripe price recurring.interval_count. >1 means a bundle, where the
   *  matches-remaining counter is meaningful; 1 (or unknown) means a
   *  monthly plan, where the counter is structurally 1-or-0 forever and
   *  therefore not shown as a number (billing plan §3.3). */
  intervalCount: number | null;
  matchesRemaining: number;
  /** Stripe's real current_period_end (unix seconds) — the actual next
   *  charge date under Stripe's own natural billing cycle. Interim source
   *  for the zero-counter renewal date until Track E1's renew-check job
   *  exists and takes over scheduling renewals explicitly. */
  currentPeriodEnd?: number | null;
  /** Injectable for tests — defaults to now. */
  today?: Date;
};

// Per-term charge shown in the "Renews {date} — {amount}" state. Mirrors
// the same hardcoded lookup-key -> price mapping already used elsewhere
// (the webhook's welcome-email planLabel, the billing page's own
// planLabel) rather than fetching the live Stripe price on every render.
// Exported for Track C4 (lib/billing-notice.ts) to reuse — same map, same
// staleness tradeoff already accepted here, rather than a second source of
// truth for the amount.
export const TERM_AMOUNTS: Record<string, string> = {
  founding_member: "€15",
  commitment_3mo: "€24",
  standard_monthly: "€12",
  // Archived price (its one subscriber predates the archival — confirmed
  // live via Stripe 2026-08-26: price_1TWiRZQXyrloqZVhmqAwNp3g,
  // unit_amount 4800 = €48 billed every 6 months). Archived only means it
  // can't be sold again, not that the number changed.
  commitment_6mo: "€48",
};

const PAYMENT_FAILED_STRIPE_STATUSES = new Set([
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
]);

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function deriveMemberStatusMessage(input: MemberStatusInput): MemberStatusMessage {
  const { stripeStatus, priceLookupKey, intervalCount, matchesRemaining, currentPeriodEnd } = input;

  if (stripeStatus === "canceled") {
    // A self-cancellation normally only reaches Stripe's "canceled" status
    // once the billing period actually ends, by which point a bundle
    // member has used every match in the term. But an immediately-
    // cancelling Stripe billing portal configuration (set in the Stripe
    // Dashboard, outside this codebase) could in principle cancel mid-term
    // with matches still owed — gate on the counter, not just the raw
    // status, so that member still sees an accurate "Active — N left"
    // rather than a premature "Membership ended."
    if (matchesRemaining <= 0) {
      return { label: "Membership ended", tone: "muted" };
    }
  }

  if (priceLookupKey && FYP_LOOKUP_KEYS.has(priceLookupKey)) {
    // Reads as a plain "Active" now, like every other active member — the
    // FYP explanation moved to annotate the Plan row instead (planTooltip),
    // since it's a fact about the plan, not a different kind of "active."
    return {
      label: "Active",
      tone: "active",
      planTooltip: "Included with your First Year Program plan",
    };
  }

  if (PAYMENT_FAILED_STRIPE_STATUSES.has(stripeStatus)) {
    return { label: "Payment needed — Update your card", tone: "warning" };
  }

  const isBundle = (intervalCount ?? 1) > 1;

  if (isBundle && matchesRemaining >= 2) {
    return { label: `Active — ${matchesRemaining} matches left`, tone: "active" };
  }
  if (isBundle && matchesRemaining === 1) {
    const dateTooltip = currentPeriodEnd
      ? `Your subscription will renew on ${formatFullDate(new Date(currentPeriodEnd * 1000))} so that you continue receiving matches.`
      : `Your subscription will renew so that you continue receiving matches.`;
    return { label: "Active — 1 match left", tone: "active", dateTooltip };
  }
  if (matchesRemaining >= 1) {
    return { label: "Active", tone: "active" };
  }

  // matchesRemaining <= 0 — the renew-at-zero pause, ahead of Track E's
  // actual cutover machinery. Shows Stripe's real currentPeriodEnd (see
  // the type comment above) rather than a fabricated date.
  if (currentPeriodEnd) {
    const amount = priceLookupKey ? TERM_AMOUNTS[priceLookupKey] : undefined;
    const dateLabel = new Date(currentPeriodEnd * 1000).toLocaleDateString("en-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return {
      label: amount ? `Renews ${dateLabel} — ${amount}` : `Renews ${dateLabel}`,
      tone: "info",
    };
  }
  return { label: "Renewing soon", tone: "info" };
}

export const STATUS_TONE_CLASSNAMES: Record<StatusTone, string> = {
  active: "bg-green-100 text-green-700",
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  muted: "bg-gray-100 text-gray-500",
};
