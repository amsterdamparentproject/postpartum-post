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
import { deriveMemberStatusMessage, STATUS_TONE_CLASSNAMES } from "@/lib/member-status";

function formatDate(unixTimestamp: number) {
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function BillingContent() {
  const { loading, member, accessToken } = useAccount();
  const searchParams = useSearchParams();
  const optinParam = searchParams.get("optin");
  const [showSkipBanner, setShowSkipBanner] = useState(
    optinParam === "skip" || optinParam === "already_skip" || optinParam === "skip_failed"
  );
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isPortalPending, startPortalTransition] = useTransition();
  const [isCancelPending, startCancelTransition] = useTransition();

  useEffect(() => {
    if (member && accessToken) {
      setSubscriptionLoading(true);
      getSubscriptionDetails(accessToken).then((data) => {
        setSubscription(data);
        setSubscriptionLoading(false);
      });
    }
  }, [member, accessToken]);

  function handleManageBilling() {
    if (!member?.stripe_customer_id) return;
    startPortalTransition(async () => {
      const url = await getCustomerPortalUrl(member.stripe_customer_id!);
      window.location.href = url;
    });
  }

  const isFoundingMember = subscription?.price_lookup_key === "founding_member";
  const planLabel =
    isFoundingMember
      ? "Founding member (€5/mo)"
      : subscription?.price_lookup_key === "commitment_3mo"
      ? "3-month commitment (€8/mo)"
      : subscription?.price_lookup_key === "standard_monthly"
      ? "Monthly (€12/mo)"
      : null;

  const statusMessage =
    subscription && member
      ? deriveMemberStatusMessage({
          stripeStatus: subscription.status,
          priceLookupKey: subscription.price_lookup_key,
          intervalCount: subscription.interval_count,
          matchesRemaining: member.matches_remaining,
        })
      : null;

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
              : "You're skipping your match this month — all good! We've automatically adjusted your billing cycle so that you're not charged this month. See you next month 💌"
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
          member?.status === "canceling" ? (
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
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMessage ? STATUS_TONE_CLASSNAMES[statusMessage.tone] : "bg-gray-100 text-gray-500"}`}>
                {statusMessage?.label}
              </span>
            </div>

            {planLabel && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Plan</span>
                <span className="text-dark font-medium">{planLabel}</span>
              </div>
            )}

            {subscription.current_period_end && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {subscription.cancel_at_period_end ? "Cancels on" : "Next billing date"}
                </span>
                <span className="text-dark font-medium">
                  {formatDate(subscription.current_period_end)}
                </span>
              </div>
            )}

            {member.consecutive_skips > 0 && (() => {
              const isMonthly = subscription.price_lookup_key === "standard_monthly";
              return (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Months skipped in a row</span>
                    <span className={`font-medium ${isMonthly && member.consecutive_skips >= 2 ? "text-amber-600" : "text-dark"}`}>
                      {isMonthly ? `${member.consecutive_skips} / 3` : member.consecutive_skips}
                    </span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    {isMonthly
                      ? "After 3 consecutive skips, your subscription will be automatically paused so you're not charged while things are busy."
                      : "On your plan, you can skip as many months as you need — we'll never auto-pause you."}
                  </p>
                </div>
              );
            })()}

            <hr className="border-border" />

            <p className="text-xs text-muted leading-relaxed">
              Skip any month from your monthly email and we&apos;ll adjust your billing automatically — no penalty, no questions asked.
            </p>

            <button
              onClick={handleManageBilling}
              disabled={isPortalPending}
              className="w-full py-2 px-4 text-sm border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPortalPending ? "Redirecting…" : "Manage billing →"}
            </button>

            {!subscription.cancel_at_period_end && (
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
                    <p className="text-xs text-muted">Cancel at the end of your billing period?</p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => {
                          if (!member) return;
                          startCancelTransition(() => unsubscribe(member.id));
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
