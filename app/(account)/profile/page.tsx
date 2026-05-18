"use client";

import { useTransition } from "react";
import ProfileForm from "@/components/ProfileForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";
import {
  getSubscriptionDetails,
  getCustomerPortalUrl,
  type SubscriptionDetails,
} from "@/app/actions/profile";
import { useEffect, useState } from "react";

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

export default function ProfilePage() {
  const { loading, member, topics } = useAccount();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [isPortalPending, startPortalTransition] = useTransition();

  useEffect(() => {
    if (member) {
      getSubscriptionDetails(member.id).then(setSubscription);
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
    subscription?.price_lookup_key === "commitment_6mo"
      ? "6-month commitment (€8/mo)"
      : subscription?.price_lookup_key === "standard_monthly"
      ? "Monthly (€12/mo)"
      : null;

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] ?? { label: subscription.status, className: "bg-gray-100 text-gray-500" }
    : null;

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Left column */}
        <div className="space-y-6">
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
            <ProfileForm
              memberId={member.id}
              initialData={member}
              topics={topics}
              mode="profile"
              section="personal"
            />
          </div>

          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 space-y-4">
            <h2 className="text-base font-semibold text-dark">Plan & billing</h2>
            {!subscription ? (
              <p className="text-sm text-muted">No active subscription found.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Status</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo?.className}`}>
                    {statusInfo?.label}
                  </span>
                </div>

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

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Consecutive skips</span>
                  <span className="text-dark font-medium">{member.consecutive_skips}</span>
                </div>

                {planLabel && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Plan</span>
                    <span className="text-dark font-medium">{planLabel}</span>
                  </div>
                )}

                <hr className="border-border" />

                <button
                  onClick={handleManageBilling}
                  disabled={isPortalPending}
                  className="w-full py-2 px-4 text-sm border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPortalPending ? "Redirecting…" : "Manage billing →"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right column — preferences */}
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            memberId={member.id}
            initialData={member}
            topics={topics}
            mode="profile"
            section="preferences"
          />
        </div>
      </div>
    </div>
  );
}
