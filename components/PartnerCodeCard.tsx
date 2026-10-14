"use client";

import { useState, useTransition } from "react";
import { redeemCohortCode } from "@/app/actions/redeem-cohort-code";

/**
 * "Have a code from a partner program?" card on the billing page of a paying
 * member who isn't in a cohort yet. A valid code adds the cohort and a free
 * round (see app/actions/redeem-cohort-code.ts), then the page reloads so the
 * new balance and cohort show.
 */
export default function PartnerCodeCard({ accessToken }: { accessToken: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await redeemCohortCode(accessToken, code);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setJoined(result.cohortName);
      setTimeout(() => window.location.reload(), 1800);
    });
  }

  if (joined) {
    return (
      <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-dark">
        You&apos;re in! Welcome from {joined}. A free round has been added to your membership.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="partner-code" className="block text-sm font-medium text-dark">
        Have a code from Dutch Speaking Academy?
      </label>
      <p className="text-xs text-muted leading-relaxed">
        Add it here to join the Dutch Speaking Academy program. Your next match will be with a fellow student and is included free of charge in your program. After that match, your billing will resume normally.
      </p>
      <div className="flex gap-2">
        <input
          id="partner-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          placeholder="Your code"
          className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-dark focus:border-coral focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending || !code.trim()}
          className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm text-dark hover:border-coral hover:text-coral transition disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add code"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
