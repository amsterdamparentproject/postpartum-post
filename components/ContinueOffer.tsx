"use client";

import { useEffect, useState, useTransition } from "react";
import { startContinueCheckout, getContinueOfferDetails } from "@/app/actions/continue";
import { formatEuros, type ContinueOfferDetails, type ContinuePlan } from "@/lib/continue-offer-pricing";

/**
 * "Keep going" buttons on the billing page of a comped cohort member whose free
 * match is used. Prices and discount come from Stripe (the cohort's promotion
 * code), and each button starts a Checkout with the discount already applied
 * (see lib/continue-offer.ts).
 */
export default function ContinueOffer({ accessToken }: { accessToken: string }) {
  const [offer, setOffer] = useState<ContinueOfferDetails | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingPlan, setPendingPlan] = useState<ContinuePlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getContinueOfferDetails(accessToken)
      .then((details) => {
        if (!cancelled) setOffer(details);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function choose(plan: ContinuePlan) {
    setError(null);
    setPendingPlan(plan);
    startTransition(async () => {
      try {
        await startContinueCheckout(accessToken, plan);
      } catch (e) {
        // A successful start redirects (which throws internally); only show real failures.
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        setPendingPlan(null);
        setError("Something went wrong. Please try again, or email us.");
      }
    });
  }

  if (!offer) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-dark font-medium">Keep going? Here&apos;s {offer.discountText} as a thank-you.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {offer.plans.map(({ plan, label, regularCents, offerCents }) => (
          <button
            key={plan}
            onClick={() => choose(plan)}
            disabled={isPending}
            className="rounded-xl border border-border bg-white px-4 py-3 text-left hover:border-coral transition disabled:opacity-60"
          >
            <span className="block text-sm font-semibold text-dark">{label}</span>
            <span className="block text-sm text-dark">
              {formatEuros(offerCents)} <span className="text-muted line-through">{formatEuros(regularCents)}</span>
            </span>
            {isPending && pendingPlan === plan && <span className="block text-xs text-muted mt-1">One moment…</span>}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-muted leading-relaxed">
        {offer.durationNote} Post Perks unlock when you continue.
      </p>
    </div>
  );
}
