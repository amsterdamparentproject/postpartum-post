"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestRematch } from "@/app/actions/rematch";

export default function RematchForm({ memberId }: { memberId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await requestRematch(memberId, reason.trim() || null);
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
        className="text-2xl font-semibold text-dark mb-3 text-center"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Request a new match
      </h1>
      <p className="text-muted text-sm leading-relaxed mb-6 text-center">
        No problem — we&apos;ll find you a different match for this month. Let us know if there&apos;s anything that would help us pair you better.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-dark mb-1">
            Anything you&apos;d like us to know? <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. I'd love someone with a baby around the same age, or I'd prefer to practise Dutch this month…"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted text-sm focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-coral">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
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
