import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import PerkIdeaForm from "@/components/PerkIdeaForm";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import AnimatedSparkleDivider from "@/components/AnimatedSparkleDivider";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Perks · Postpartum Post",
};

/**
 * Placeholder for the eventual public Post Perks page — mirrors
 * not-found.tsx's look on purpose (same emoji/serif-heading/muted-subtext
 * shape) since there's nothing to show here yet either. Linked from
 * PartnerTerms's "public Perks page" mention.
 *
 * Carries the same Post Perks visual language as /partners
 * (PartnerSplash.tsx) — the green PostPerksWordMark and the
 * scroll-triggered wiggling Sparkle divider — rather than the plain
 * coral-text heading this page started with, so the two pages read as the
 * same brand rather than two different ad-hoc treatments of "Post Perks."
 */
export default function PerksPage() {
  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-6 py-8 text-center">
        <div>
          <AnimatedSparkleDivider />
          <h1
            className="text-4xl text-dark mb-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <PostPerksWordMark size="text-4xl" /> are coming soon!
          </h1>
          <p className="text-dark text-lg mt-4 max-w-md mx-auto">
            We&apos;ll be launching <span className="text-coral font-bold">discounts, freebies, and more</span> at your favorite family-friendly local spots in Fall 2026.
          </p>
        </div>
        <PerkIdeaForm />
        <div className="bg-white/80 border border-green-light rounded-2xl shadow-sm px-6 py-4 max-w-md mx-auto text-sm text-dark hover:bg-green-light/20 transition-colors">
          Want to offer a Post Perk?{" "}
          <Link
            href="/partners"
            className="text-coral font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Head on over to our Partners page
          </Link>{" "}
          for more info.
        </div>
      </main>
    </PageLayout>
  );
}
