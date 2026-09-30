import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import PerkIdeaForm from "@/components/PerkIdeaForm";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import AnimatedSparkleDivider from "@/components/AnimatedSparkleDivider";
import Link from "next/link";
import PublicPerksCarousel from "@/components/PublicPerksCarousel";
import { listPublicPerks } from "@/lib/public-perks";
import WordMark from "@/components/WordMark";

export const metadata: Metadata = {
  title: "Perks · Postpartum Post",
};

// Same cadence as the homepage; perk and partner-photo actions also call
// revalidatePerksPage() (lib/revalidate-perks.ts) so an approval shows up right away.
export const revalidate = 300;

/**
 * The public Post Perks page. The "coming soon" hero, idea form and
 * partner CTA stay as they are; live and coming-soon perks (the first
 * ones!) list under the idea form as PerkCards, paged like the /partners
 * carousel (PublicPerksCarousel), and the section simply doesn't render
 * while there are none. Cards are display-only: no codes
 * or links leave the server here (see lib/public-perks.ts) — redeeming is
 * the future members-only "Use this perk" flow.
 *
 * Originally a placeholder for the eventual public Post Perks page — mirrors
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
export default async function PerksPage() {
  const perks = await listPublicPerks();

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-6 py-8 text-center">
        {perks.length > 0 ? (
          <section className="w-full max-w-sm md:max-w-2xl mx-auto">
            <AnimatedSparkleDivider />
            <h1 className="text-4xl text-dark mb-3" style={{ fontFamily: "var(--font-serif)" }}>
              Sneak peek at our first <PostPerksWordMark size="text-4xl" />
            </h1>
            <p className="text-muted text-center mt-2 mb-6">Launching October 2026, exclusively for <WordMark size="text-base" /> members. If you are new here, don’t miss the giveaway below!</p>
            <PublicPerksCarousel perks={perks} />
          </section>
        ) : (
          // No perks yet: keep the "coming soon" hero so the page isn't just a form.
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
        )}

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
