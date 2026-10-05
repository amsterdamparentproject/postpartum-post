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

const title = "Dutch Speaking Academy × Postpartum Post";
const description =
  "Dutch for Parents students get one free match through Postpartum Post: a fellow parent from your round to practice real Dutch with, in person or on video.";

// Prototype for Dutch Speaking Academy to review: kept out of search results
// (and out of the sitemap) until the partnership terms are final.
export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
};

// DSA's own colors, sampled from its logo, used as accents next to Post's coral.
const DSA_TERRACOTTA = "#B1502B";
const DSA_GOLD = "#E4C58F";

const FAQS: FAQItem[] = [
  {
    question: "Do I need a card?",
    answer:
      "No. Your free match doesn't need any payment details. Afterward you can choose to continue with a special offer for Dutch for Parents students. Nothing renews on its own, because there's nothing on file to charge.",
  },
  {
    question: "Do I have to live in Amsterdam?",
    answer:
      "No. You're matched with another parent from your Dutch for Parents round, wherever you live. If you live near each other, you can meet in person. If not, a video call is a great way to practice Dutch too.",
  },
  {
    question: "Who will I be matched with?",
    answer:
      "Another parent from your round, picked by looking at things like your availability and, where possible, how close you live. We warmly introduce you by email, and what happens next is up to the two of you.",
  },
  {
    question: "What if my Dutch isn't great yet?",
    answer:
      "Perfect, you're in good company! Everyone in Dutch for Parents is practicing, and mistakes are the whole point. You'll be paired with someone doing exactly the same.",
  },
  {
    question: "What happens after my free match?",
    answer:
      "Your free match is one round, and then it's over unless you'd like more. We'll send Dutch for Parents students a special offer to keep going, completely optional.",
  },
  {
    question: "What information is shared with my match?",
    answer:
      "Only your name and contact email, in a warm introduction to the parent you've matched with. We never share your personal profile details. You can read more on our Privacy Policy page.",
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

export default function DutchSpeakingAcademyPage() {
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
            Dutch for Parents students get <strong>one free match</strong>{" "}
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
              For Dutch for Parents students. You&apos;ll need the code from Mariska.
            </p>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
            <DutchCohortSignupForm />
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
          Dutch for Parents is run by{" "}
          <a
            href="https://dutchspeakingacademy.nl/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-coral transition-colors"
          >
            Dutch Speaking Academy
          </a>
          . Matching is run by Postpartum Post. Curious how it works?{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-coral transition-colors">
            Read more about us
          </Link>
          .
        </p>
      </main>
    </PageLayout>
  );
}
