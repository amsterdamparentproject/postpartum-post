"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import FeedbackForm from "@/components/FeedbackForm";
import { useAccount } from "@/app/(account)/AccountContext";
import { getFeedbackContext, type FeedbackContext } from "@/app/actions/feedback";

export default function FeedbackPage() {
  const { loading, member } = useAccount();
  const [context, setContext] = useState<FeedbackContext | null>(null);

  useEffect(() => {
    if (member) getFeedbackContext(member.id).then(setContext);
  }, [member]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest redirectTo="/feedback" />;

  return (
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
        memberId={member.id}
        matchIds={context?.matchIds ?? []}
        monthLabel={context?.monthLabel ?? null}
      />
    </div>
  );
}
