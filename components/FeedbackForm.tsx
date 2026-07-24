"use client";

import { useState, useTransition } from "react";
import { submitMatchFeedback } from "@/app/actions/feedback";

type RatingKey = "happyWithMatch" | "matchingProcessRating" | "matchPageHelpful" | "activitiesRelevant";

function ratingFields(isPlural: boolean): { key: RatingKey; label: string }[] {
  return [
    { key: "happyWithMatch", label: `I'm happy with my ${isPlural ? "matches" : "match"}` },
    { key: "matchingProcessRating", label: "The whole matching process met my expectations" },
    { key: "matchPageHelpful", label: `I found the match page helpful for planning a meetup with my ${isPlural ? "matches" : "match"}` },
    { key: "activitiesRelevant", label: "The recommended activities were relevant to me" },
  ];
}
type Ratings = Record<RatingKey, number | null>;

function RatingScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-dark mb-3">{label}</p>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-xs text-muted shrink-0">Not at all</span>
        <div className="flex items-center gap-2 flex-1 justify-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={value === n}
              className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors cursor-pointer ${
                value === n
                  ? "bg-coral border-coral text-white"
                  : "border-border text-muted hover:border-coral hover:text-coral"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted shrink-0">Absolutely!</span>
      </div>
    </div>
  );
}

export default function FeedbackForm({
  memberId,
  matchIds,
  monthLabel,
}: {
  memberId: string;
  matchIds: string[];
  monthLabel: string | null;
}) {
  const [ratings, setRatings] = useState<Ratings>({
    happyWithMatch: null,
    matchingProcessRating: null,
    matchPageHelpful: null,
    activitiesRelevant: null,
  });
  const [activitiesFeedback, setActivitiesFeedback] = useState("");
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [willingToFollowUp, setWillingToFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fields = ratingFields(matchIds.length > 1);
  const allRated = fields.every((f) => ratings[f.key] !== null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allRated) {
      setError("Please rate all four questions before submitting.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await submitMatchFeedback(memberId, matchIds, {
          happyWithMatch: ratings.happyWithMatch!,
          matchingProcessRating: ratings.matchingProcessRating!,
          matchPageHelpful: ratings.matchPageHelpful!,
          activitiesRelevant: ratings.activitiesRelevant!,
          activitiesFeedback: activitiesFeedback.trim() || undefined,
          generalFeedback: generalFeedback.trim() || undefined,
          willingToFollowUp,
        });
        setSubmitted(true);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 text-center space-y-2">
        <div className="text-4xl">💌</div>
        <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Thank you!
        </h2>
        <p className="text-sm text-muted">
          Your feedback means a lot — it directly shapes what we build next.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 space-y-8">
      {monthLabel && (
        <p className="text-sm text-muted">
          Sharing feedback about your <span className="font-medium text-dark">{monthLabel}</span>.
        </p>
      )}

      {fields.map((f) => (
        <RatingScale
          key={f.key}
          label={f.label}
          value={ratings[f.key]}
          onChange={(v) => setRatings((r) => ({ ...r, [f.key]: v }))}
        />
      ))}

      <div>
        <label htmlFor="activitiesFeedback" className="block text-sm font-medium text-dark mb-2">
          Any feedback on the recommended activities?
        </label>
        <textarea
          id="activitiesFeedback"
          value={activitiesFeedback}
          onChange={(e) => setActivitiesFeedback(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-dark placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
        />
      </div>

      <div>
        <label htmlFor="generalFeedback" className="block text-sm font-medium text-dark mb-2">
          Any other feedback on Postpartum Post in general?
        </label>
        <textarea
          id="generalFeedback"
          value={generalFeedback}
          onChange={(e) => setGeneralFeedback(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-dark placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={willingToFollowUp}
          onChange={(e) => setWillingToFollowUp(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-border accent-coral shrink-0"
        />
        <span className="text-sm font-medium text-dark">
          I&apos;m willing to chat about my experience with Postpartum Post further — you can reach out to me via email to coordinate.
        </span>
      </label>

      {error && <p className="text-sm text-coral">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        data-umami-event="Feedback: Submit"
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {isPending ? "Submitting…" : "Submit feedback"}
      </button>

      <p className="text-xs text-muted text-center leading-relaxed">
        Thank you for your feedback! I&apos;m always here at{" "}
        <a href="mailto:post@amsterdamparentproject.nl" className="underline hover:text-dark transition-colors">
          post@amsterdamparentproject.nl
        </a>{" "}
        if you want to chat about any of it further ❤️
      </p>
    </form>
  );
}
