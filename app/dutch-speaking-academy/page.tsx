import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import TextLogo from "@/components/TextLogo";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import AnimatedSparkleDivider from "@/components/AnimatedSparkleDivider";
import DutchCohortSignupForm from "@/components/DutchCohortSignupForm";
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

const STEPS = [
  {
    icon: "🎓",
    title: "Join Dutch for Parents",
    body: "Your live round with Mariska starts October 20.",
  },
  {
    icon: "🔑",
    title: "Sign up here with your code",
    body: "It's free and needs no card. Your code comes from Mariska.",
  },
  {
    icon: "💌",
    title: "Opt in, get matched, meet up",
    body: "Opt in November 1–5 and your match is revealed on November 7. You decide when and how to meet.",
  },
];

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
    answer:
      "A monthly friendship starter pack for parents: one curated match with someone local, delivered like a little letter. It's a project of Amsterdam Parent Project, and you can learn how matching works on our About page.",
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
            className="text-4xl md:text-5xl leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span style={{ color: DSA_TERRACOTTA }}>Speak Dutch anyway.</span>{" "}
            <span className="block text-dark">With a fellow parent.</span>
          </h1>
          <p className="mt-6 text-base text-dark leading-relaxed max-w-lg mx-auto">
            Dutch for Parents students get <strong>one free match</strong>{" "}
            through Postpartum Post in
            November: another parent from your round to practice the conversations you actually
            have, from the school gate to the playdate. Meet in person if you live nearby, or hop on a
            video call if you don&apos;t.
          </p>
          <a
            href="#signup"
            data-umami-event="DSA: Hero CTA"
            className="inline-block mt-8 py-3 px-8 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Claim your free match
          </a>
        </section>

        <div className="w-full max-w-md my-10">
          <AnimatedSparkleDivider />
        </div>

        {/* How it works */}
        <section className="w-full max-w-sm md:max-w-2xl">
          <h2
            className="text-2xl md:text-3xl text-dark text-center mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How it <span style={{ color: DSA_TERRACOTTA }}>works</span>
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-5 text-center"
              >
                <span className="text-3xl" aria-hidden="true">
                  {step.icon}
                </span>
                <p
                  className="mt-3 text-xs font-bold uppercase tracking-wide"
                  style={{ color: DSA_TERRACOTTA }}
                >
                  Step {i + 1}
                </p>
                <h3
                  className="mt-1 text-lg text-dark leading-snug"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Why a match */}
        <section className="w-full max-w-xl mt-12 text-center">
          <h2
            className="text-2xl md:text-3xl text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Practice is better <span className="text-coral">with company</span>
          </h2>
          <p className="text-dark leading-relaxed">
            Dutch for Parents gets you the words and the confidence. A match gives you somewhere
            low-stakes to use them: one parent, one conversation, no audience. Your match arrives like
            a little letter, with a name, a few things you have in common, and an open invitation to
            meet.
          </p>
        </section>

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
            <DutchCohortSignupForm opensLabel="Signup opens October 20" />
          </div>
        </section>

        {/* FAQ */}
        <div className="w-full max-w-xl mt-12">
          <FAQ
            faqs={FAQS}
            heading={
              <>
                Questions, <span className="text-coral">answered</span>
              </>
            }
            subheading="A few things Dutch for Parents students often ask."
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
