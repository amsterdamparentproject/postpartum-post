"use client";

import { useState, useTransition } from "react";
import { submitPerkIdea } from "@/app/actions/partners";
import AnimatedThankYou from "@/components/AnimatedThankYou";
import { LocationStamp } from "@/components/StampIcons";
import Link from "next/link";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

/**
 * The small suggestion box on /perks while the page itself is still just a
 * "coming soon" splash — lets a visitor point at a business without
 * needing an account. Feeds submitPerkIdea (app/actions/partners.ts),
 * which files it as an 'idea' lead for Alex to follow up on from
 * /admin/partners. Styled after the homepage Gift Card CTA (same
 * bg-white/80 backdrop-blur card with a purple-light border, instead of
 * the plain border-border used elsewhere) rather than floating unstyled
 * below the splash text — input/button treatment still matches SignupForm.
 *
 * Also carries the giveaway pitch + checkbox — "win 1 of 3 free matches to
 * Postpartum Post, including Post Perks" (see
 * __claude__/free-trial-plan.md) — in its own tinted callout so the ask
 * has real context, not just a bare checkbox label. Checking it reveals
 * name (optional) + email (required) and enters the visitor in the
 * drawing alongside their suggestion. The two are independent: a
 * suggestion always gets submitted even if the giveaway entry specifically
 * fails to save (see submitPerkIdea's giveawayError handling).
 *
 * NOTE: the prize is a real 1-month gift card (lib/gift-cards.ts), not a
 * bespoke "trial" construct — winners redeem through the normal
 * /redeem → SignupForm → checkout flow and become regular active members
 * for that month, so Post Perks access just applies to them like it would
 * anyone else (no carve-out logic needed). See __claude__/free-trial-plan.md
 * for why this replaced the earlier bespoke-trial plan, and note there's
 * currently no way to mint a gift card without a real Stripe purchase —
 * a one-off script is still needed to comp the 3 winners' cards.
 *
 * On submit the card swaps to AnimatedThankYou — the envelope/heart
 * mark from EnvelopeLogo, animated so a card slides out of the envelope
 * — instead of a plain "Thanks!" heading, so the payoff for filling
 * this in reads as Postpartum Post rather than as a generic form
 * confirmation.
 *
 * The submit button is Post Perks green rather than the coral used on
 * forms elsewhere, matching PartnerLeadForm on /partners — both forms are
 * Post Perks entry points, so they should read as the same thing. The
 * inputs and the giveaway callout stay coral, which is still the page's
 * base palette.
 */
export default function PerkIdeaForm() {
  const [url, setUrl] = useState("");
  const [wantsGiveaway, setWantsGiveaway] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [giveawayError, setGiveawayError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGiveawayError(null);
    startTransition(async () => {
      const result = await submitPerkIdea({
        url,
        wantsGiveaway,
        name: wantsGiveaway ? name : undefined,
        email: wantsGiveaway ? email : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't submit — try again");
        return;
      }
      if (result.giveawayError) {
        setGiveawayError(result.giveawayError);
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-purple-light/40 shadow-sm p-8 text-center">
        {/* The animation says "Thank you" itself, in the same serif these
            headings use, so the heading here is screen-reader only rather
            than a second, redundant "Thanks!" stacked above it. */}
        <h2 className="sr-only">Thank you!</h2>
        <AnimatedThankYou className="mx-auto" />
        <p className="text-dark mt-4">
          Thanks for submitting your favorite place! We&apos;re on it 🫡
        </p>
        {wantsGiveaway && !giveawayError && (
          <p className="text-sm text-muted mt-2">
            We&apos;ll announce giveaway winners around the time we launch Post Perks, and
            we&apos;ll let you know if you&apos;ve won over email. Subscribe to our{" "}
            <Link
              href="https://amsterdamparentproject.com/newsletter"
              className="text-coral hover:underline underline-offset-2"
            >
              newsletter
            </Link>{" "}
            or follow us on{" "}
            <a
              href="https://instagram.com/amsterdamparentproject"
              target="_blank"
              rel="noopener noreferrer"
              className="text-coral hover:underline underline-offset-2"
            >
              Instagram
            </a>{" "}
            to stay up to date.
          </p>
        )}
        {giveawayError && <p className="text-sm text-coral mt-2">{giveawayError}</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-purple-light/40 shadow-sm p-8 text-left">
      <div className="flex justify-center mb-4">
        <LocationStamp fill="rgba(212, 224, 155, 0.18)" stroke="#8A9E3A" background="white" />
      </div>
      <p className="text-lg font-medium text-dark mb-4">
        Have a favorite place to go as a parent that you think would make a great perk?
      </p>
      <p className="mb-4">Drop their website or Google Maps link here:</p>
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

        <div className="bg-coral/5 border border-coral/20 rounded-xl p-4 space-y-2">
          <p className="text-medium font-bold text-coral leading-relaxed">
            🎁 Enter the giveaway
          </p>
          <p className="text-sm text-muted leading-relaxed">
            We&apos;re giving <b>3 parents a free match</b>{" "}with Postpartum Post (including Post
            Perks!) as a thank-you for sharing your favorite spots with us. Who knows —
            maybe you&apos;ll soon be able to use a Post Perk at the place you submitted today 😎
          </p>
          <label className="flex items-start gap-2 mt-4 text-sm text-dark cursor-pointer">
            <input
              type="checkbox"
              checked={wantsGiveaway}
              onChange={(e) => setWantsGiveaway(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-coral focus:ring-coral/40"
            />
            <span>Yes, enter me in the giveaway!</span>
          </label>
          {wantsGiveaway && (
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                aria-label="Your name"
                className={inputClass}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Your email"
                aria-label="Your email"
                className={inputClass}
              />
              <p className="text-xs pl-1 italic text-muted leading-relaxed">
                Rest assured, we won&apos;t use your details for anything other than this giveaway.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-coral">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 px-6 bg-green hover:bg-green-light text-dark font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
