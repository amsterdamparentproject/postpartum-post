"use client";

import { useState, useTransition } from "react";
import { submitPerkIdea } from "@/app/actions/partners";
import AnimatedThankYou from "@/components/AnimatedThankYou";
import EnvelopeLogo from "@/components/EnvelopeLogo";

/**
 * A "suggest a place" call-to-action shaped like a PerkCard, so it sits in
 * a grid of perks as the last card. A compact PerkIdeaForm (the box on
 * /perks): the Postpartum Post envelope, the same question, link field and Post Perks
 * green Send button, and the same AnimatedThankYou on success — minus the
 * giveaway, which is for non-members. Files the link as an 'idea' lead via
 * submitPerkIdea, same as the /perks form.
 */
export default function PerkIdeaCard() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitPerkIdea({ url, wantsGiveaway: false });
      if (!result.success) {
        setError(result.error ?? "Couldn't submit — try again");
        return;
      }
      setSubmitted(true);
    });
  }

  function resetForm() {
    setUrl("");
    setError(null);
    setSubmitted(false);
  }

  return (
    <div className="w-full bg-white/80 backdrop-blur rounded-2xl border border-purple-light/40 shadow-sm overflow-hidden flex flex-col">
      {/* Same 16:9 top as PerkCard's photo, so the card lines up in a grid. */}
      <div className="relative aspect-[16/9] bg-cream flex items-center justify-center">
        {submitted ? (
          <AnimatedThankYou width={150} />
        ) : (
          <EnvelopeLogo width={96} height={71} />
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        {submitted ? (
          <div className="space-y-2">
            <p className="text-sm text-dark leading-relaxed">
              Thanks for submitting your favorite place! We&apos;re on it 🫡
            </p>
            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-medium text-coral hover:underline underline-offset-2"
            >
              Submit another
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg leading-snug text-dark" style={{ fontFamily: "var(--font-serif)" }}>
              Know a spot that would make a great perk?
            </h3>
            <p className="text-sm text-dark/80">Drop their website or Google Maps link here:</p>
            <form onSubmit={handleSubmit} className="mt-auto pt-1 flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://"
                aria-label="Website or Google Maps link"
                className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
              />
              <button
                type="submit"
                disabled={isPending}
                className="shrink-0 px-4 py-2 bg-green hover:bg-green-light text-dark text-sm font-semibold rounded-lg transition disabled:opacity-60"
              >
                {isPending ? "Sending…" : "Send"}
              </button>
            </form>
            {error && <p className="text-xs text-coral">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
