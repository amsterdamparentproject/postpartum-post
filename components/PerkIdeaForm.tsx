"use client";

import { useState, useTransition } from "react";
import { submitPerkIdea } from "@/app/actions/partners";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

/**
 * The small suggestion box on /perks while the page itself is still just a
 * "coming soon" splash — lets a visitor point at a business without
 * needing an account or any contact info. Feeds submitPerkIdea
 * (app/actions/partners.ts), which files it as an 'idea' lead for Alex to
 * follow up on from /admin/partners. Styled after the homepage Gift Card CTA (same
 * bg-white/80 backdrop-blur card with a purple-light border, instead of
 * the plain border-border used elsewhere) rather than floating unstyled
 * below the splash text — input/button treatment still matches SignupForm.
 */
export default function PerkIdeaForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitPerkIdea({ url });
      if (!result.success) {
        setError(result.error ?? "Couldn't submit — try again");
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-purple-light/40 shadow-sm p-8 text-center">
        <h2 className="text-xl text-dark mb-1" style={{ fontFamily: "var(--font-serif)" }}>
          Thanks!
        </h2>
        <p className="text-sm text-muted">We&apos;ll take a look.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-purple-light/40 shadow-sm p-8 text-left">
      <p className="text-4xl text-center mb-4">🗺️</p>
      <p className="text-lg font-medium text-dark mb-4">
        Have a favorite place to go as a parent that you think would make a great perk?
      </p>
      <p className="text-sm mb-4">Drop their website or Google Maps link here:</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://"
          aria-label="Website or Google Maps link"
          className={inputClass}
        />
        {error && <p className="text-sm text-coral">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
