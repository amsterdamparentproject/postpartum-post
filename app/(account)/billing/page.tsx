"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";
import {
  getSubscriptionDetails,
  getCustomerPortalUrl,
  type SubscriptionDetails,
} from "@/app/actions/profile";
import { unsubscribe } from "@/app/actions/unsubscribe";
import { deriveMemberStatusMessage, STATUS_TONE_CLASSNAMES, type MemberStatusMessage } from "@/lib/member-status";
import { FYP_LOOKUP_KEYS } from "@/lib/match-ledger";
import { isComped, hasPerksAccess } from "@/lib/billing-mode";
import { COHORT_NAMES } from "@/lib/cohort";

// Accepts either a Stripe unix timestamp (a real instant — formatted in the
// viewer's local zone, as this always has) or a Date (deriveMemberStatusMessage's
// renewsAt — a synthetic UTC-midnight calendar date with no real time-of-day
// component, so it's formatted in UTC to avoid shifting a day off depending on
// the viewer's timezone).
function formatDate(value: number | Date) {
  if (typeof value === "number") {
    return new Date(value * 1000).toLocaleDateString("en-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return value.toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Alert icon + hover/focus tooltip, anchored next to a value that needs
 *  more explanation than fits in the surrounding label — currently just
 *  the "Next billing date" row on the status card. */
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <svg
        className="w-3.5 h-3.5 text-muted cursor-help"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        tabIndex={0}
        role="img"
        aria-label={text}
      >
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
          clipRule="evenodd"
        />
      </svg>
      <span className="pointer-events-none absolute right-0 bottom-full z-10 mb-2 w-56 rounded-lg bg-dark px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}

function BillingContent() {
  const { loading, member, accessToken } = useAccount();
  const searchParams = useSearchParams();
  const optinParam = searchParams.get("optin");
  const [showSkipBanner, setShowSkipBanner] = useState(
    optinParam === "skip" || optinParam === "already_skip" || optinParam === "skip_failed" || optinParam === "no_balance"
  );
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  // Tracks whether a fetch has resolved (not just whether the result was
  // non-null — a member can legitimately have no subscription).
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const subscriptionLoading = !subscriptionLoaded;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isPortalPending, startPortalTransition] = useTransition();
  const [isCancelPending, startCancelTransition] = useTransition();

  useEffect(() => {
    if (!member || !accessToken) return;
    getSubscriptionDetails(accessToken).then((data) => {
      setSubscription(data);
      setSubscriptionLoaded(true);
    });
  }, [member, accessToken]);

  function handleManageBilling() {
    if (!member?.stripe_customer_id) return;
    startPortalTransition(async () => {
      const url = await getCustomerPortalUrl(member.stripe_customer_id!);
      window.location.href = url;
    });
  }

  const isFoundingMember = subscription?.price_lookup_key === "founding_member";
  const isFypMember = !!subscription?.price_lookup_key && FYP_LOOKUP_KEYS.has(subscription.price_lookup_key);
  const planLabel =
    isFoundingMember
      ? "Founding member (€5/mo)"
      : subscription?.price_lookup_key === "commitment_3mo"
      ? "3-month commitment (€8/mo)"
      : subscription?.price_lookup_key === "standard_monthly"
      ? "Monthly (€12/mo)"
      : isFypMember
      ? "Monthly (€0/mo)"
      : null;

  // Cancellation is tracked in our own members.status, not Stripe's
  // cancel_at_period_end: Stripe only collects money (billing plan), and a
  // member who cancels is left paused in Stripe until their matches run out.
  const isCanceling = member?.status === "canceling";
  const canceledStatusMessage: MemberStatusMessage | null =
    isCanceling && member
      ? {
          label:
            member.matches_remaining > 0
              ? `Canceled — ${member.matches_remaining} ${member.matches_remaining === 1 ? "match" : "matches"} left`
              : "Canceled",
          tone: "muted",
          tooltip: "You won't be charged again. You keep your remaining matches until they're used.",
        }
      : null;

  const statusMessage =
    canceledStatusMessage ??
    (subscription && member
      ? deriveMemberStatusMessage({
          stripeStatus: subscription.status,
          cancellationReason: subscription.cancellation_reason,
          priceLookupKey: subscription.price_lookup_key,
          intervalCount: subscription.interval_count,
          matchesRemaining: member.matches_remaining,
          latestInvoiceOpenAndAttempted: subscription.latest_invoice_open_and_attempted,
          currentPeriodEnd: subscription.current_period_end,
        })
      : null);

  // Track E1's renew-check date (the 10th) when deriveMemberStatusMessage
  // has one — it's the real next-charge date once Track E2's
  // pause_collection sits between renewals. Falls back to Stripe's raw
  // current_period_end everywhere else.
  // A canceled member is never billed again, so there is no next billing date.
  const nextBillingDate: number | Date | undefined = isCanceling
    ? undefined
    : statusMessage?.renewsAt ?? subscription?.current_period_end ?? undefined;

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  return (
    <div className="space-y-6">
      {showSkipBanner && (
        <div
          className={
            optinParam === "skip_failed"
              ? "bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start justify-between gap-4"
              : "bg-[#caadff]/30 border border-[#caadff] rounded-2xl px-5 py-4 flex items-start justify-between gap-4"
          }
        >
          <p className={`text-sm leading-relaxed ${optinParam === "skip_failed" ? "text-red-800" : "text-dark"}`}>
            {optinParam === "skip_failed"
              ? <>Something went wrong recording your skip for this month, so we couldn&apos;t confirm it — you may still be matched or charged as usual. Please try the link from your email again, or contact us at <a href="mailto:post@amsterdamparentproject.nl" className="underline">post@amsterdamparentproject.nl</a> and we&apos;ll sort it out.</>
              : optinParam === "already_skip"
              ? <>You&apos;ve already chosen to skip this month. If you&apos;d like to rejoin the match pool, please contact us at <a href="mailto:post@amsterdamparentproject.nl" className="underline">post@amsterdamparentproject.nl</a>.</>
              : optinParam === "no_balance"
              ? "You're between terms right now, so this month's match is on pause — check your status below for when you'll be matched again."
              : "You're skipping your match this month — all good! Your match is saved for next time, and nothing about your billing changes. See you next month 💌"
            }
          </p>
          <button
            onClick={() => setShowSkipBanner(false)}
            className="shrink-0 text-muted hover:text-dark transition text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="max-w-md space-y-6">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 space-y-4">
        <h2 className="text-base font-semibold text-dark">Plan & billing</h2>

        {subscriptionLoading ? (
          <p className="text-sm text-muted">Fetching your plan…</p>
        ) : !subscription ? (
          isComped(member.billing_mode) && member.status === "active" ? (
            // Comped members (e.g. the free Dutch for Parents match) have no
            // Stripe subscription, so there's no plan, billing date or portal.
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Status</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    member.matches_remaining > 0 ? STATUS_TONE_CLASSNAMES.active : STATUS_TONE_CLASSNAMES.muted
                  }`}
                >
                  {member.matches_remaining > 0 ? "Free match ready" : "Free match used"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Plan</span>
                <span className="text-dark font-medium">
                  {member.cohort && COHORT_NAMES[member.cohort]
                    ? `Free match, ${COHORT_NAMES[member.cohort]}`
                    : "Free match"}
                </span>
              </div>
              <hr className="border-border" />
              <p className="text-xs text-muted leading-relaxed">
                {member.matches_remaining > 0
                  ? "Nothing is charged, and no card is on file. Opt in between the 1st and the 5th of the month to claim your match."
                  : "Your free match has been used. Nothing is charged, and nothing renews. We'll email you a special offer if you'd like to keep going."}
                {!hasPerksAccess(member.billing_mode) && " Post Perks unlock when you continue."}
              </p>
              <div className="text-center">
                {!confirmCancel ? (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="text-xs text-muted hover:text-dark transition"
                  >
                    Leave Postpartum Post
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      Leave Postpartum Post?{" "}
                      {member.matches_remaining > 0 && "Your unused free match will be forfeited. "}
                      Nothing is being charged either way.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => {
                          if (!member || !accessToken) return;
                          startCancelTransition(() => unsubscribe(accessToken));
                        }}
                        disabled={isCancelPending}
                        className="text-xs px-3 py-1.5 bg-dark text-white rounded-lg hover:bg-dark/80 transition disabled:opacity-60"
                      >
                        {isCancelPending ? "Leaving…" : "Yes, leave"}
                      </button>
                      <button
                        onClick={() => setConfirmCancel(false)}
                        className="text-xs px-3 py-1.5 border border-border rounded-lg text-muted hover:text-dark transition"
                      >
                        Never mind
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : member?.status === "canceling" ? (
            <p className="text-sm text-muted">
              Your membership is active — you&apos;ll keep receiving matches and won&apos;t be charged again.
            </p>
          ) : (
            <p className="text-sm text-muted">Membership ended.</p>
          )
        ) : (
          <>
            {/* Skip this month banner (Track C2: sourced from monthly_skips,
                not Stripe's pause_collection — see "Next billing date" below
                for when billing actually resumes) */}
            {subscription.is_skipping_this_month && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="font-medium">Skipping this month</span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Status</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMessage ? STATUS_TONE_CLASSNAMES[statusMessage.tone] : "bg-gray-100 text-gray-500"}`}>
                  {statusMessage?.label}
                </span>
                {statusMessage?.tooltip && <InfoTooltip text={statusMessage.tooltip} />}
              </span>
            </div>

            {planLabel && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Plan</span>
                <span className="text-dark font-medium inline-flex items-center gap-1.5">
                  {planLabel}
                  {statusMessage?.planTooltip && <InfoTooltip text={statusMessage.planTooltip} />}
                </span>
              </div>
            )}

            {nextBillingDate !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {subscription.cancel_at_period_end ? "Cancels on" : "Next billing date"}
                </span>
                <span className="text-dark font-medium inline-flex items-center gap-1.5">
                  {formatDate(nextBillingDate)}
                  {statusMessage?.dateTooltip && <InfoTooltip text={statusMessage.dateTooltip} />}
                </span>
              </div>
            )}

            <hr className="border-border" />

            <p className="text-xs text-muted leading-relaxed">
              Skip any month from your monthly email — no penalty, no questions asked. Your match is saved for next time.
            </p>

            <button
              onClick={handleManageBilling}
              disabled={isPortalPending}
              className="w-full py-2 px-4 text-sm border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPortalPending ? "Redirecting…" : "Manage billing →"}
            </button>

            {!subscription.cancel_at_period_end && !isCanceling && (
              <div className="text-center">
                {!confirmCancel ? (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="text-xs text-muted hover:text-dark transition"
                  >
                    Cancel subscription
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">Cancel your subscription? You&apos;ll keep any matches you have left.</p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => {
                          if (!member || !accessToken) return;
                          startCancelTransition(() => unsubscribe(accessToken));
                        }}
                        disabled={isCancelPending}
                        className="text-xs px-3 py-1.5 bg-dark text-white rounded-lg hover:bg-dark/80 transition disabled:opacity-60"
                      >
                        {isCancelPending ? "Cancelling…" : "Yes, cancel"}
                      </button>
                      <button
                        onClick={() => setConfirmCancel(false)}
                        className="text-xs px-3 py-1.5 border border-border rounded-lg text-muted hover:text-dark transition"
                      >
                        Never mind
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
