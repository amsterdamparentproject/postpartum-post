"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import FeedbackForm from "@/components/FeedbackForm";
import { useAccount } from "@/app/(account)/AccountContext";
import { getFeedbackContext, type FeedbackContext } from "@/app/actions/feedback";

export default function FeedbackPage() {
  const { loading, member, accessToken } = useAccount();
  const [context, setContext] = useState<FeedbackContext | null>(null);
  // Arrived via "We met!" in the meetup reminder email (/api/meetup-status).
  const [justMet, setJustMet] = useState(false);

  useEffect(() => {
    if (!member || !accessToken) return;
    // Read ?match=<id> (and ?met=1) directly rather than via useSearchParams,
    // which would need a Suspense boundary around this client page. This has
    // to run in an effect, not a useState lazy initializer: the meetup-status
    // link arrives here via a client-side router.replace() out of
    // /auth/confirm, and window.location isn't reliably updated to this
    // page's own URL yet at the moment a lazy initializer would run —
    // an effect (which fires after the navigation settles) reads it correctly.
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get("match") ?? undefined;
    const met = params.get("met") === "1";
    getFeedbackContext(accessToken, matchId).then((ctx) => {
      setContext(ctx);
      if (met) setJustMet(true);
    });
  }, [member, accessToken]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest redirectTo="/feedback" />;

  return (
    <div className="space-y-6">
      {/* Full-width, right under the tab nav — same pattern as the profile opt-in banner */}
      {justMet && (
        <div className="bg-green/30 border border-green rounded-2xl px-5 py-4 flex items-start justify-between gap-4">
          <p className="text-sm text-dark leading-relaxed">
            🎉 Great to hear that you met up with your match this month! We&apos;d love to hear how it went so we can make the process even better next month.
          </p>
          <button
            onClick={() => setJustMet(false)}
            className="shrink-0 text-muted hover:text-dark transition text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/matches"
        className="inline-flex items-center gap-1.5 text-sm text-coral hover:text-coral-dark transition-colors"
      >
        ← Back to your matches
      </Link>
      <div className="space-y-3">
        <h1 className="text-2xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Match feedback
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          Postpartum Post is a new service matching parents of babies and toddlers each month in Amsterdam. We just launched and we&apos;re really excited to keep growing it and supporting parents.
        </p>
        <p className="text-sm text-muted leading-relaxed">
          Your feedback is incredibly valuable at this stage — it helps me (solo builder and also toddler mom!) better prioritize the things that feel most important to you to make this service as useful as possible.
        </p>
      </div>

      <FeedbackForm
        accessToken={accessToken ?? ""}
        matchIds={context?.matchIds ?? []}
        monthLabel={context?.monthLabel ?? null}
      />
    </div>
    </div>
  );
}
