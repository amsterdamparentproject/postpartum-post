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
 *
 * Copy pass (2026-08-27, per product review of the "in product" preview):
 * the pill's own text is deliberately short now — "Active — 1 match left",
 * "Renews in 3 days" — with the explanatory detail (why it renews, what it
 * costs, what it grants) moved into `dateTooltip`, surfaced next to the
 * "Next billing date" row on /billing via a hover-triggered alert icon
 * rather than crammed into the pill. `renewsAt` exists alongside it so
 * that row shows the exact date the tooltip is talking about — see the
 * type doc below for why that's not always the same as Stripe's
 * subscription.current_period_end.
 */

export type StatusTone = "active" | "info" | "warning" | "muted";

export type MemberStatusMessage = {
  label: string;
  tone: StatusTone;
  /**
   * Populated only for the pre-10th renew-check state, where Track E1's
   * renew-check date (the 10th of this month or next) — not Stripe's
   * subscription.current_period_end — is the real next-charge date. Once
   * Track E2's pause_collection sits between renewals, current_period_end
   * no longer tracks the actual charge date, so /billing's "Next billing
   * date" row should show this instead of the raw Stripe value whenever
   * it's present. Undefined everywhere else, where current_period_end is
   * still the right thing to show.
   */
  renewsAt?: Date;
  /**
   * Explanatory tooltip for an alert icon next to the "Next billing date"
   * row — populated when the (now short) label omits context a member
   * might want: the last-match-of-a-bundle nudge, or the renewal
   * amount/date/match-grant detail. Undefined everywhere else.
   */
  dateTooltip?: string;
  /**
   * Explanatory tooltip for an alert icon next to the Status pill itself
   * (not the date row) — for states that have no billing-date row worth
   * annotating: "Payment processing" and "Renewal failed" both explain
   * themselves entirely in the tooltip rather than the pill text.
   */
  tooltip?: string;
  /**
   * Explanatory tooltip for an alert icon next to the /billing "Plan" row
   * — currently just the FYP/comped state, where the pill itself now
   * reads a plain "Active" (matching every other active member) and the
   * "this is a comped First Year Program plan" explanation moved to
   * annotate the Plan row instead.
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
   *  therefore not shown as a number (billing plan §3.3). Also doubles as
   *  the number of matches a renewal grants (matchesPerTerm in the
   *  invoice.payment_succeeded handler) — same number, same source. */
  intervalCount: number | null;
  matchesRemaining: number;
  /** True when the member's latest invoice has been submitted but hasn't
   *  settled yet (invoice.status === "open" && invoice.attempted === true).
   *  Track E2 — surfaced so a mid-settlement SEPA charge reads as an honest
   *  "still processing" rather than a stale renewal date. */
  latestInvoiceOpenAndAttempted?: boolean;
  /** Stripe's real current_period_end (unix seconds). Narrow purpose only:
   *  the last-match-of-a-bundle tooltip's date. Unlike the zero-counter
   *  state, a subscription sitting at matchesRemaining === 1 hasn't been
   *  touched by Track E2's pause_collection yet, so Stripe's own date is
   *  still accurate here — same value /billing's "Next billing date" row
   *  already falls back to showing for this state. */
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

/**
 * Next month's 10th, unconditionally — distinct from nextRenewCheckDate()
 * above, which answers "what's the very next renew-check" for a member
 * already sitting at zero, and which can answer *this* month's 10th when
 * called before the 10th. This answers a different question, asked only
 * by the match-reveal email's last-match counter notice (Track C4): a
 * bundle member with exactly 1 match left as of today's reveal email will
 * use it in *next* month's round (~the 5th-7th), only then hitting zero —
 * so the renew-check that actually catches them is next month's 10th,
 * shortly after that round. E.g. sent 7 Aug: their last match goes out
 * ~5-7 Sep, decrementing them to zero, and the very next renew-check
 * (monthly, on the 10th) is 10 Sep — not 10 Oct. Assumes `today` is the
 * email's send date (always the 7th in practice); not meant for the
 * "already at zero" case.
 */
export function renewCheckDateAfterNextRound(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 10));
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthName(date: Date): string {
  return date.toLocaleDateString("en-NL", { month: "long", timeZone: "UTC" });
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
      // Copy signed off 2026-08-27: short pill + tooltip, matching the
      // "Payment processing" state's shape below. Always shown regardless
      // of matchesRemaining — Track E1 only ever attempts a renewal charge
      // once a member is already at zero, so this state is inherently a
      // zero-counter one; no need to gate it a second time.
      return {
        label: "Renewal failed",
        tone: "warning",
        tooltip: "We couldn't process your renewal. Please update your payment details or contact us.",
      };
    }
    // A self-cancellation normally only reaches Stripe's "canceled" status
    // once the billing period actually ends (cancelSubscription() sets
    // cancel_at_period_end, not an immediate cancel — see
    // app/actions/unsubscribe.ts), by which point a bundle member has used
    // every match in the term. But the Stripe customer billing portal
    // (Manage billing →) can be configured in the Stripe Dashboard to
    // cancel immediately, outside our control here — if it is, a member
    // could hit "canceled" mid-term with matches still owed. Gate on the
    // counter, not just the raw status, so that member still sees an
    // accurate "Active — N left" rather than a premature "Membership
    // ended"; falls through to the matches-remaining branches below.
    if (matchesRemaining <= 0) {
      return { label: "Membership ended", tone: "muted" };
    }
  }

  if (priceLookupKey && FYP_LOOKUP_KEYS.has(priceLookupKey)) {
    // Copy pass 2026-08-27: reads as a plain "Active" now, like every
    // other active member — the FYP explanation moved to annotate the
    // Plan row instead (planTooltip), since it's a fact about the plan,
    // not a different kind of "active."
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

  if (isBundle && matchesRemaining >= 1) {
    const matchWord = matchesRemaining === 1 ? "match" : "matches";
    const label = `Active — ${matchesRemaining} ${matchWord} left`;
    if (matchesRemaining === 1) {
      const dateTooltip = input.currentPeriodEnd
        ? `Your subscription will renew on ${formatFullDate(new Date(input.currentPeriodEnd * 1000))} so that you continue receiving matches.`
        : `Your subscription will renew so that you continue receiving matches.`;
      return { label, tone: "active", dateTooltip };
    }
    return { label, tone: "active" };
  }
  if (matchesRemaining >= 1) {
    return { label: "Active", tone: "active" };
  }

  // matchesRemaining <= 0 — the renew-at-zero window.
  if (latestInvoiceOpenAndAttempted) {
    return {
      label: "Renewal — Payment processing",
      tone: "info",
      tooltip: "We'll match you again once your payment clears. This can take a few weeks. Go to Manage billing for more information.",
    };
  }
  if (today.getUTCDate() < 10) {
    const renewDate = nextRenewCheckDate(today);
    const dateLabel = formatFullDate(renewDate);
    const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const daysUntil = Math.round((renewDate.getTime() - startOfToday) / (24 * 60 * 60 * 1000));
    const relativeLabel = daysUntil <= 0 ? "Renews today" : daysUntil === 1 ? "Renews tomorrow" : `Renews in ${daysUntil} days`;

    const amount = priceLookupKey ? TERM_AMOUNTS[priceLookupKey] : undefined;
    const matchesPerTerm = intervalCount ?? 1;
    const matchWord = matchesPerTerm === 1 ? "match" : "matches";
    const nextMonthLabel = monthName(new Date(Date.UTC(renewDate.getUTCFullYear(), renewDate.getUTCMonth() + 1, 1)));
    const dateTooltip = amount
      ? `You will be charged ${amount} on ${dateLabel}, which will grant you ${matchesPerTerm} more ${matchWord} starting in ${nextMonthLabel}.`
      : `You will be charged on ${dateLabel}, which will grant you ${matchesPerTerm} more ${matchWord} starting in ${nextMonthLabel}.`;

    return {
      label: relativeLabel,
      tone: "info",
      renewsAt: renewDate,
      dateTooltip,
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
