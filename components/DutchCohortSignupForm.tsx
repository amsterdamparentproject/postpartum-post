"use client";

import { useState, useTransition } from "react";
import { signupCohort } from "@/app/actions/signup-cohort";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

const labelClass = "block text-sm font-medium text-dark mb-1";

/**
 * Signup form for Dutch for Parents students (the /dutch-speaking-academy
 * splash page). Calls signupCohort: a free, no-card signup that creates a
 * comped member tagged with the cohort.
 */
export default function DutchCohortSignupForm() {
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await signupCohort({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        code: String(form.get("code") ?? ""),
        eligibilityConfirmed,
        guidelinesAccepted,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setDone(true);
      }
    });
  }

  if (done) {
    return (
      <div className="text-center space-y-3 py-4">
        <span className="text-4xl" aria-hidden="true">💌</span>
        <p className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          You&apos;re in!
        </p>
        <p className="text-sm text-muted leading-relaxed">
          Check your email for a welcome note and a link to your profile. Opt in November 1–5 to
          claim your free match.
        </p>
      </div>
    );
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
            Included in your course
          </span>
        </div>
        <span className="block text-lg font-semibold text-dark leading-tight">
          Free cohort match (€0)
        </span>
        <span className="block text-sm text-muted mt-1">
          1 free match with a fellow student during your Dutch for Parents course
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
        disabled={isPending}
        data-umami-event="DSA: Cohort signup"
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {isPending ? "Signing you up…" : "Claim my free match"}
      </button>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </form>
  );
}
