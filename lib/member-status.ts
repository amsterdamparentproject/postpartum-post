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
 * Two of the five §3.3 states below — "renew check pending" and
 * "resuming" — don't have real backing machinery yet (that's Track E1's
 * renew-check job). Until then they're derived from the calendar: E1 runs
 * on the 20th of the month, so a member sitting at zero matches before the
 * 20th is "pending" a renewal check, and on/after the 20th they're
 * "resuming" (or should be, once E1 actually exists).
 */

export type StatusTone = "active" | "info" | "warning" | "muted";

export type MemberStatusMessage = {
  label: string;
  tone: StatusTone;
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

/**
 * The 20th of the current month if it hasn't passed yet, otherwise the
 * 20th of next month (rolling into next year in December) — mirrors
 * Track E1's renew-check job, which runs monthly on the 20th.
 */
export function nextRenewCheckDate(today: Date): Date {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  const targetMonth = day < 20 ? month : month + 1;
  return new Date(Date.UTC(year, targetMonth, 20));
}

export function deriveMemberStatusMessage(input: MemberStatusInput): MemberStatusMessage {
  const { stripeStatus, priceLookupKey, intervalCount, matchesRemaining } = input;
  const today = input.today ?? new Date();

  if (stripeStatus === "canceled") {
    return { label: "Membership ended", tone: "muted" };
  }

  if (priceLookupKey && FYP_LOOKUP_KEYS.has(priceLookupKey)) {
    return { label: "Included with your First Year Program", tone: "info" };
  }

  if (PAYMENT_FAILED_STRIPE_STATUSES.has(stripeStatus)) {
    return { label: "Payment needed — update your card", tone: "warning" };
  }

  const isBundle = (intervalCount ?? 1) > 1;

  if (isBundle && matchesRemaining >= 2) {
    return { label: `Active — ${matchesRemaining} matches left`, tone: "active" };
  }
  if (isBundle && matchesRemaining === 1) {
    return { label: "Last match of your bundle. Renews after this one.", tone: "active" };
  }
  if (matchesRemaining >= 1) {
    return { label: "Active", tone: "active" };
  }

  // matchesRemaining <= 0 — the renew-at-zero pause, ahead of Track E's
  // actual cutover machinery.
  if (today.getUTCDate() < 20) {
    const renewDate = nextRenewCheckDate(today);
    const amount = priceLookupKey ? TERM_AMOUNTS[priceLookupKey] : undefined;
    const dateLabel = renewDate.toLocaleDateString("en-NL", {
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
  return { label: "Renewing now", tone: "info" };
}

export const STATUS_TONE_CLASSNAMES: Record<StatusTone, string> = {
  active: "bg-green-100 text-green-700",
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  muted: "bg-gray-100 text-gray-500",
};
