import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import { EnvelopeStamp } from "@/components/StampIcons";
import HowMatchingWorks from "@/components/HowMatchingWorks";
import FAQ from "@/components/FAQ";
import WordMark from "@/components/WordMark";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Postpartum Post: Who we are, why we started, and how we match new and expecting parents in Amsterdam with each other every month.",
  openGraph: {
    title: "About Postpartum Post",
    description:
      "Learn about Postpartum Post: Who we are, why we started, and how we match new and expecting parents in Amsterdam with each other every month.",
  },
};

export default function About() {
  return (
    <PageLayout showNav activeRoute="/about">
      <main className="flex-1 w-full px-6 py-16">
        <div className="max-w-xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <EnvelopeStamp size={96} />
          </div>
          <h1
            className="text-4xl text-dark mb-6 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            About <WordMark size="text-4xl" />
          </h1>
          <div className="space-y-4 text-dark leading-relaxed text-left">
            <p>
              The postpartum period is one of the most transformative — and often loneliest — times in a parent's life.
              Parent groups can be great for support, but <b>sometimes you need just one person</b>, not a room full of them.
            </p>
            <p>
              We're here to <b>connect new and expecting parents in the neighborhood</b> for coffee, a playdate,
              or an understanding chat. We'll warmly introduce you to one person each month, sharing their name and contact
              along with local activities handpicked for your families.
            </p>
            <p>
              Postpartum Post was created for people who want to build deep connections — but <b>at the busy pace of early parenthood</b>.
              We created a subscription to signal a committment to the community, even if life gets in the way. Subscriptions are flexible by design: skip any month, pause when life gets full, cancel anytime.
              In one click, you pick the topic, we find the match, and deliver the introduction in a delightful little letter to your inbox.
            </p>
          </div>
          <Link
            href="/"
            data-umami-event="About: Sign Up Today"
            className="inline-block mt-8 py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Sign up today
          </Link>
        </div>

        {/* How matching works */}
        <div className="mt-20 max-w-4xl mx-auto">
          <HowMatchingWorks />
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-4xl mx-auto">
          <FAQ />
        </div>
      </main>
    </PageLayout>
  );
}
