"use client";

import { useState } from "react";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

const labelClass = "block text-sm font-medium text-dark mb-1";

/**
 * Signup form for Dutch for Parents students (the /dutch-speaking-academy
 * splash page). UI-only for now: it is not wired to the signup action, the
 * database or Stripe yet, so submitting is disabled until `open` is true.
 * The real flow is a free, no-card signup that tags the new member with the
 * cohort flag (see __claude__/dsa-cohort-perks.md and the plan in
 * __claude__/ for the comped-member approach).
 */
export default function DutchCohortSignupForm({
  open = false,
  opensLabel,
}: {
  /** Flip to true once the real signup action is wired up. */
  open?: boolean;
  /** Shown on the disabled button, e.g. "Signup opens October 20". */
  opensLabel: string;
}) {
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Intentionally a no-op until the cohort signup action exists.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="dfp-firstName" className={labelClass}>
            First name <RequiredMark />
          </label>
          <input
            id="dfp-firstName"
            name="firstName"
            type="text"
            required
            autoComplete="given-name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="dfp-lastName" className={labelClass}>
            Last name <RequiredMark />
          </label>
          <input
            id="dfp-lastName"
            name="lastName"
            type="text"
            required
            autoComplete="family-name"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="dfp-email" className={labelClass}>
          Email <RequiredMark />
        </label>
        <input
          id="dfp-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="dfp-code" className={labelClass}>
          Your Dutch for Parents code <RequiredMark />
        </label>
        <input
          id="dfp-code"
          name="code"
          type="text"
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="Code from Mariska"
          className={`${inputClass} uppercase placeholder:normal-case`}
        />
      </div>

      <div className="p-4 rounded-lg border-2 border-coral bg-coral/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xl" aria-hidden="true">💌</span>
          <span className="text-xs font-medium text-coral bg-coral/10 px-2 py-0.5 rounded-full">
            Included with your course
          </span>
        </div>
        <span className="block text-lg font-semibold text-dark leading-tight">
          One free match, <span className="text-coral">€0</span>
        </span>
        <span className="block text-sm text-muted mt-1">
          No card needed. Opt in November 1–5 and your match is revealed November 7.
        </span>
      </div>

      <div className="space-y-3 pt-1">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={eligibilityConfirmed}
            onChange={(e) => setEligibilityConfirmed(e.target.checked)}
            required
            className="mt-0.5 shrink-0 accent-coral"
          />
          <span className="text-sm text-dark leading-snug">
            I am a parent (or expecting a child) and 18 or older
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={guidelinesAccepted}
            onChange={(e) => setGuidelinesAccepted(e.target.checked)}
            required
            className="mt-0.5 shrink-0 accent-coral"
          />
          <span className="text-sm text-dark leading-snug">
            I agree to the{" "}
            <a
              href="/community-guidelines"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-coral transition-colors"
            >
              Community Guidelines
            </a>
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={!open}
        data-umami-event="DSA: Cohort signup"
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {open ? "Claim my free match" : opensLabel}
      </button>

      {!open && (
        <p className="text-xs text-muted text-center leading-relaxed">
          Your Dutch for Parents round hasn&apos;t started yet. This form goes live when it does.
        </p>
      )}
    </form>
  );
}
