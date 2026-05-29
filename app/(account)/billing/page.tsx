"use client";

import { useEffect, useState, useTransition } from "react";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";
import {
  getSubscriptionDetails,
  getCustomerPortalUrl,
  type SubscriptionDetails,
} from "@/app/actions/profile";
import { unsubscribe } from "@/app/actions/unsubscribe";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  trialing: { label: "Trial", className: "bg-blue-100 text-blue-700" },
  past_due: { label: "Past due", className: "bg-yellow-100 text-yellow-700" },
  incomplete: { label: "Incomplete", className: "bg-yellow-100 text-yellow-700" },
  unpaid: { label: "Unpaid", className: "bg-red-100 text-red-700" },
  canceled: { label: "Canceled", className: "bg-gray-100 text-gray-500" },
};

function formatDate(unixTimestamp: number) {
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BillingPage() {
  const { loading, member } = useAccount();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isPortalPending, startPortalTransition] = useTransition();
  const [isCancelPending, startCancelTransition] = useTransition();

  useEffect(() => {
    if (member) {
      setSubscriptionLoading(true);
      getSubscriptionDetails(member.id).then((data) => {
        setSubscription(data);
        setSubscriptionLoading(false);
      });
    }
  }, [member]);

  function handleManageBilling() {
    if (!member?.stripe_customer_id) return;
    startPortalTransition(async () => {
      const url = await getCustomerPortalUrl(member.stripe_customer_id!);
      window.location.href = url;
    });
  }

  const planLabel =
    subscription?.price_lookup_key === "first20_3mo"
      ? "Founding member (€5/mo)"
      : subscription?.price_lookup_key === "commitment_3mo"
      ? "3-month commitment (€8/mo)"
      : subscription?.price_lookup_key === "standard_monthly"
      ? "Monthly (€12/mo)"
      : null;

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] ?? { label: subscription.status, className: "bg-gray-100 text-gray-500" }
    : null;

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  return (
    <div className="max-w-md space-y-6">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 space-y-4">
        <h2 className="text-base font-semibold text-dark">Plan & billing</h2>

        {subscriptionLoading ? (
          <p className="text-sm text-muted">Fetching your plan…</p>
        ) : !subscription ? (
          <p className="text-sm text-muted">No active subscription found.</p>
        ) : (
          <>
            {/* Skip this month banner */}
            {subscription.pause_collection && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="font-medium">Skipping this month</span>
                {subscription.pause_collection.resumes_at && (
                  <span className="text-amber-700">
                    {" "}— billing resumes {formatDate(subscription.pause_collection.resumes_at)}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Status</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo?.className}`}>
                {statusInfo?.label}
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
  );
}
