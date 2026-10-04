import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import PerkIdeaForm from "@/components/PerkIdeaForm";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import AnimatedSparkleDivider from "@/components/AnimatedSparkleDivider";
import Link from "next/link";
import PublicPerksCarousel from "@/components/PublicPerksCarousel";
import { listPublicPerks } from "@/lib/public-perks";
import { summarizeLivePerks } from "@/lib/perk-summary";
import WordMark from "@/components/WordMark";
import Sparkle from "@/components/Sparkle";
import JoinLink from "@/components/JoinLink";

const title = "Post Perks";
const description =
  "Discounts and freebies from local, parent-centric Amsterdam businesses, just for Postpartum Post members and their families — from 50% off to intro offers.";
const banner = {
  url: "/og-perks.png",
  width: 1200,
  height: 630,
  alt: "post perks: discounts from local parent-centric businesses, just for Postpartum Post members",
};

// The root layout's title template ("%s · Postpartum Post") applies to `title`
// only, so it's just "Post Perks" here; openGraph/twitter titles are spelled
// out in full. openGraph and twitter also replace the root layout's blocks
// wholesale rather than merging, so siteName/locale/card are repeated.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/perks" },
  openGraph: {
    type: "website",
    locale: "en_NL",
    siteName: "Postpartum Post",
    url: "/perks",
    title: `${title} · Postpartum Post`,
    description,
    images: [banner],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · Postpartum Post`,
    description,
    images: [banner.url],
  },
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
  const { count: liveCount, totalSavings } = summarizeLivePerks(perks);

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-6 py-8 text-center">
        {perks.length > 0 ? (
          <section className="w-full max-w-sm md:max-w-2xl mx-auto">
            <AnimatedSparkleDivider />
            <h1 className="text-4xl text-dark mb-3" style={{ fontFamily: "var(--font-serif)" }}>
              Our first <PostPerksWordMark size="text-4xl" /> are here
            </h1>
            <p className="text-muted text-center mt-2 mb-6">
              {liveCount > 0 && totalSavings > 0 ? (
                <>
                  <span className="font-bold text-coral bg-white/80 rounded-full px-2 py-0.5" style={{ border: "1.5px solid rgba(212, 224, 155, 0.70)" }}>{liveCount} {liveCount === 1 ? "perk" : "perks"}</span> from local family-friendly businesses <span className="font-bold text-coral bg-white/80 rounded-full px-2 py-0.5" style={{ border: "1.5px solid rgba(203, 223, 189, 0.90)" }}>worth €{totalSavings}</span> (and counting!), exclusively for <WordMark size="text-base" /> members.
                </>
              ) : (
                <>Launching October 2026, exclusively for <WordMark size="text-base" /> members.</>
              )}{" "}
              If you are new here, don’t miss the giveaway below 🎁
            </p>
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

        {liveCount > 0 && totalSavings > 0 && (
          <JoinLink
            umamiEvent="Perks: Join (button)"
            className="perk-shine group relative overflow-hidden flex items-center justify-center gap-2 w-full max-w-md py-3.5 px-6 rounded-full text-lg font-bold text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:brightness-110 transition"
            style={{ backgroundColor: "#8A9E3A" }}
          >
            <Sparkle className="w-6 h-6 group-hover-wiggle" />
            Unlock €{totalSavings} worth of perks
            <span aria-hidden="true">→</span>
          </JoinLink>
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
