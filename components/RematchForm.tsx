"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestRematch } from "@/app/actions/rematch";
import type { ActiveMatch } from "@/app/rematch/page";

const REASONS: { value: string; label: string }[] = [
  { value: "no_response",    label: "They didn't respond" },
  { value: "already_met",    label: "I already know this person" },
  { value: "not_a_good_fit", label: "We weren't a good fit" },
  { value: "safety_concern", label: "I have a safety concern" },
  { value: "other",          label: "Other" },
];

export default function RematchForm({
  memberId,
  activeMatches,
}: {
  memberId: string;
  activeMatches: ActiveMatch[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState(activeMatches[0]?.matchId ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await requestRematch(memberId, reason || null, selectedMatchId || undefined);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError("Something went wrong. Please try again.");
        }
      }
    });
  }

  return (
    <div className="max-w-md w-full bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
      <div className="text-4xl mb-5 text-center">🔄</div>
      <h1
        className="text-2xl text-dark mb-3 text-center"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Request a new match
      </h1>
      <p className="text-muted text-sm leading-relaxed mb-6 text-center">
        No problem — we&apos;ll find you a different match for this month. Let us know if there&apos;s anything that would help us pair you better.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {activeMatches.length > 1 && (
          <div>
            <p className="block text-sm font-medium text-dark mb-2">Which match?</p>
            <div className="space-y-2">
              {activeMatches.map((m) => (
                <label
                  key={m.matchId}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    selectedMatchId === m.matchId ? "border-coral bg-coral/5" : "border-border hover:border-dark"
                  }`}
                >
                  <input
                    type="radio"
                    name="matchId"
                    value={m.matchId}
                    checked={selectedMatchId === m.matchId}
                    onChange={() => setSelectedMatchId(m.matchId)}
                    className="accent-coral"
                  />
                  <div>
                    <p className="text-sm text-dark font-medium">{m.partnerFirstName} {m.partnerLastName}</p>
                    <p className="text-xs text-muted">{m.partnerEmail}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-dark mb-1">
            What&apos;s the reason?
          </label>
          <div className="relative">
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-border bg-white text-dark text-sm focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
            >
              <option value="" disabled>Select a reason…</option>
              {REASONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {error && (
          <p className="text-sm text-coral">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending || !reason || !selectedMatchId}
          data-umami-event="Rematch: Request New Match"
          className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Submitting…" : "Request a new match"}
        </button>

        <Link
          href="/"
          className="block text-center text-sm text-muted hover:text-dark transition"
        >
          Never mind, keep my current match
        </Link>
      </form>
    </div>
  );
}
