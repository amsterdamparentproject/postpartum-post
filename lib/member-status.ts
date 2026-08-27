import { FYP_LOOKUP_KEYS } from "@/lib/match-ledger";

/**
 * Our own member-facing billing-status vocabulary — billing plan §3.3,
 * Track C1. "Stripe's subscription status is never shown to a member."
 *
 * Stripe's raw subscription status is still read here — it's the source of
 * truth for payment health — but it never reaches the member directly; this
 * function is the one translation point from Stripe's vocabulary to ours.
 *
 * Track E1's renew-check job runs monthly on the 10th (revised from the
 * plan's original 15th once Track D's SEPA rehearsal showed the 15th left
 * almost no runway for settlement — see
 * __claude__/billing-simplification-plan.md, Track E "Renewal timing"). A
 * member sitting at zero matches before the 10th is "pending" a renewal
 * check; on/after the 10th they're "resuming."
 *
 * Track E2 also added a distinct "payment processing" state — a submitted-
 * but-not-yet-settled renewal charge (invoice.status === "open" &&
 * invoice.attempted === true, exactly what Track D observed a SEPA-funded
 * charge sit in for up to ~3 weeks) — and a distinct state for a
 * subscription Stripe canceled outright after a rejected SEPA mandate
 * (Track D case 6b), separate from a member's own cancellation.
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
  /** Stripe's cancellation_details.reason, only meaningful when
   *  stripeStatus === "canceled". Distinguishes a member-initiated
   *  cancellation from Stripe canceling the subscription outright after a
   *  rejected SEPA mandate (Track D case 6b) — a member in that second case
   *  didn't choose to leave, so it gets its own message. */
  cancellationReason?: string | null;
  priceLookupKey: string | null;
  /** Stripe price recurring.interval_count. >1 means a bundle, where the
   *  matches-remaining counter is meaningful; 1 (or unknown) means a
   *  monthly plan, where the counter is structurally 1-or-0 forever and
   *  therefore not shown as a number (billing plan §3.3). */
  intervalCount: number | null;
  matchesRemaining: number;
  /** True when the member's latest invoice has been submitted but hasn't
   *  settled yet (invoice.status === "open" && invoice.attempted === true).
   *  Track E2 — surfaced so a mid-settlement SEPA charge reads as an honest
   *  "still processing" rather than a stale renewal date. */
  latestInvoiceOpenAndAttempted?: boolean;
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

/**
 * The 10th of the current month if it hasn't passed yet, otherwise the
 * 10th of next month (rolling into next year in December) — mirrors
 * Track E1's renew-check job, which runs monthly on the 10th.
 */
export function nextRenewCheckDate(today: Date): Date {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  const targetMonth = day < 10 ? month : month + 1;
  return new Date(Date.UTC(year, targetMonth, 10));
}

export function deriveMemberStatusMessage(input: MemberStatusInput): MemberStatusMessage {
  const { stripeStatus, cancellationReason, priceLookupKey, intervalCount, matchesRemaining, latestInvoiceOpenAndAttempted } = input;
  const today = input.today ?? new Date();

  if (stripeStatus === "canceled") {
    if (cancellationReason === "payment_failed") {
      // Track D case 6b: Stripe canceled the subscription outright after
      // judging a SEPA mandate/account mismatch unusable, rather than
      // retrying like it does for a card decline. A member here didn't
      // choose to leave, so this is deliberately not "Membership ended."
      // Flagged for product review (billing-simplification-plan.md, Track
      // E2) — this wording is a first draft, not signed off.
      return {
        label: "We couldn't process your renewal — please update your payment details or contact us.",
        tone: "warning",
      };
    }
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
    const dateTooltip = `Your subscription will renew on ${formatFullDate(nextRenewCheckDate(today))} so that you continue receiving matches.`;
    return { label: "Active — 1 match left", tone: "active", dateTooltip };
  }
  if (matchesRemaining >= 1) {
    return { label: "Active", tone: "active" };
  }

  // matchesRemaining <= 0 — the renew-at-zero window.
  if (latestInvoiceOpenAndAttempted) {
    return {
      label: "Payment processing — you'll be matched once it clears (can take a few weeks for bank transfers)",
      tone: "info",
    };
  }
  if (today.getUTCDate() < 10) {
    const renewDate = nextRenewCheckDate(today);
    const amount = priceLookupKey ? TERM_AMOUNTS[priceLookupKey] : undefined;
    const dateLabel = formatFullDate(renewDate);
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
