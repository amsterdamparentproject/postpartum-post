import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import TextLogo from "@/components/TextLogo";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import DutchCohortSignupForm from "@/components/DutchCohortSignupForm";
import HowMatchingWorks from "@/components/HowMatchingWorks";
import { DSA_STEPS } from "@/components/DutchCohortSteps";
import FAQ, { type FAQItem } from "@/components/FAQ";
import { getCohortPerk } from "@/lib/cohort-perk";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import Sparkle from "@/components/Sparkle";

const title = "Dutch Speaking Academy × Postpartum Post";
const description =
  "Dutch Speaking Academy students get one free match through Postpartum Post: a fellow parent from your round to practice real Dutch with, in person or on video.";

export const metadata: Metadata = {
  title,
  description,
};

// DSA's own colors, sampled from its logo, used as accents next to Post's coral.
const DSA_TERRACOTTA = "#B1502B";
const DSA_GOLD = "#E4C58F";

const FAQS: FAQItem[] = [
  {
    question: "Do I need a card to sign up?",
    answer:
      "No. Your free match doesn't need any payment details. Afterward you can choose to continue with a special membership specifically for Dutch Speaking Academy students.",
  },
  {
    question: "Do I have to live in Amsterdam?",
    answer:
      "No. You're matched with another parent from Dutch Speaking Academy, wherever you live. If you live near each other, you can meet in person. If not, a video call is a great way to practice Dutch too.",
  },
  {
    question: "Who will I be matched with?",
    answer:
      "Another parent from your class or from the Dutch Speaking Academy. We match you by looking at things like your availability and how close you live. We warmly introduce you by email, and what happens next is up to the two of you.",
  },
  {
    question: "What information is shared with my match?",
    answer:
      "Only your name and contact email, in a warm introduction to the parent you've matched with. We never share your personal profile details. AI is not involved in the matching process. You can read more on our Privacy Policy page.",
  },
  {
    question: "What happens after my free match?",
    answer:
      "Your free match is one round, and then it's over unless you'd like more. We'll send Dutch Speaking Academy students a special offer to keep going, completely optional.",
  },
  {
    question: "What is Postpartum Post?",
    answer: (
      <>
        A monthly friendship starter pack for parents: one curated match with someone local,
        delivered like a little letter. It&apos;s a project of Amsterdam Parent Project, and you
        can learn how matching works on our{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-coral transition-colors">
          About page
        </Link>
        .
      </>
    ),
  },
];

// Re-check every few minutes whether the Dutch Speaking Academy perk is live, so
// the member callout appears (or goes) without a deploy.
export const revalidate = 300;

export default async function DutchSpeakingAcademyPage() {
  const perk = await getCohortPerk("Dutch Speaking Academy");
  return (
    <PageLayout showNav>
      <main className="flex-1 flex flex-col items-center px-6 pt-10 pb-12 md:pt-16">
        {/* Hero */}
        <section className="max-w-xl w-full text-center">
          <div className="flex items-center justify-center gap-4 mb-8">
            <Image
              src="/dsa/dsa-logo.png"
              alt="Dutch Speaking Academy"
              width={300}
              height={249}
              priority
              className="w-28 md:w-32 h-auto"
            />
            <span
              className="text-3xl"
              style={{ fontFamily: "var(--font-serif)", color: DSA_GOLD }}
              aria-hidden="true"
            >
              ×
            </span>
            <div className="flex flex-col items-center gap-2">
              <EnvelopeLogo width={64} height={47} />
              <TextLogo width={150} height={20} />
            </div>
          </div>

          <h1
            className="text-4xl md:text-5xl mt-10 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="block text-balance" style={{ color: DSA_TERRACOTTA }}>
              Start actually speaking Dutch,
            </span>
            <span className="block text-balance text-dark">with a fellow parent.</span>
          </h1>
          <p className="mt-6 text-base text-dark leading-relaxed max-w-lg mx-auto">
            Dutch Speaking Academy students get <strong>one free match</strong>{" "}
            through Postpartum Post with a fellow parent who&apos;s just as committed to learning
            Dutch as you are. You&apos;ll be matched 1:1 and meet up your way and on your schedule, in person or online,
            so you can finally get to speaking Dutch — and make a parent friend along the way.
          </p>
          <a
            href="#signup"
            data-umami-event="DSA: Hero CTA"
            className="perk-shine group relative overflow-hidden flex items-center justify-center gap-2 w-full max-w-md mx-auto mt-8 py-3.5 px-6 rounded-full text-lg font-bold text-dark shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:brightness-110 transition"
            style={{ backgroundColor: DSA_GOLD }}
          >
            <EnvelopeLogo width={34} height={25} className="shrink-0 group-hover-wiggle" />
            Claim your free match
            <span aria-hidden="true">→</span>
          </a>
          {perk && (
            <Link
              href={`/my-perks?perk=${perk.slug ?? perk.id}`}
              data-umami-event="DSA: Activate perk"
              className="group mt-6 block w-full max-w-md mx-auto text-left bg-white/90 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition p-5"
              style={{ border: "1.5px solid rgba(203, 223, 189, 0.90)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  <Sparkle className="w-5 h-5 group-hover-wiggle" />
                  <PostPerksWordMark size="text-base" plural={false} className="normal-case tracking-normal" />
                </span>
                {perk.estimatedSavings ? (
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full text-white shrink-0"
                    style={{ backgroundColor: "#4F5F1E" }}
                  >
                    Save €{perk.estimatedSavings}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-muted">Already a Postpartum Post member?</p>
              <p className="text-lg leading-snug text-dark" style={{ fontFamily: "var(--font-serif)" }}>
                {perk.title}
              </p>
              <span
                className="flex items-center justify-center gap-2 mt-4 py-2.5 px-5 rounded-full font-bold text-white group-hover:brightness-110 transition"
                style={{ backgroundColor: "#8A9E3A" }}
              >
                Activate your perk
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          )}
        </section>

        {/* How it works */}
        <div className="w-full mt-12 md:mt-16">
          <HowMatchingWorks
            steps={DSA_STEPS}
            heading={
              <>
                How it <span className="text-coral">works</span>
              </>
            }
            intro={null}
          />
        </div>

        {/* Signup */}
        <section id="signup" className="w-full max-w-md mt-12 scroll-mt-8">
          <div className="text-center mb-6">
            <h2
              className="text-2xl md:text-3xl text-dark mb-2"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Claim your <span className="text-coral">free match</span>
            </h2>
            <p className="text-muted text-sm">
              Just for Dutch Speaking Academy students. You&apos;ll need the code from Mariska in order to claim your match.
            </p>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
            <DutchCohortSignupForm cohort="dsa" />
          </div>
        </section>

        {/* FAQ */}
        <div className="w-full max-w-xl mt-12">
          <FAQ
            faqs={FAQS}
            heading={
              <>
                Frequently asked <span className="text-coral">questions</span>
              </>
            }
            subheading="More questions? Reach out to Mariska at Dutch Speaking Academy."
          />
        </div>

        <p className="mt-10 text-xs text-muted text-center max-w-sm leading-relaxed">
          This collaboration is run by
          <a
            href="https://dutchspeakingacademy.nl/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-coral transition-colors"
          >
            Dutch Speaking Academy{" "}
          </a>
          {" "}and Postpartum Post. Curious how it all works?{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-coral transition-colors">
            Read more about us
          </Link>
          .
        </p>
      </main>
    </PageLayout>
  );
}
