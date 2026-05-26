import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import HowMatchingWorks from "@/components/HowMatchingWorks";
import FAQ from "@/components/FAQ";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Postpartum Post — who we are, why we started, and how we match new parents in Amsterdam with each other every month.",
  openGraph: {
    title: "About Postpartum Post",
    description:
      "Learn about Postpartum Post — who we are, why we started, and how we match new parents in Amsterdam with each other every month.",
  },
};

export default function About() {
  return (
    <PageLayout showNav activeRoute="/about">
      <main className="flex-1 w-full px-6 py-16">
        <div className="max-w-xl mx-auto text-center">
          <Image
            src="/logo.png"
            alt="Postpartum Post logo"
            width={120}
            height={120}
            className="w-24 h-auto mx-auto mb-6"
          />
          <h1
            className="text-4xl font-semibold text-dark mb-6 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            About <span className="text-coral">Postpartum Post</span>
          </h1>
          <div className="space-y-4 text-muted leading-relaxed text-left">
            <p>
              The postpartum period is one of the most transformative — and often loneliest — times in a parent's life.
              Parent groups can be great for support, but <b>sometimes you need just one person</b>, not a room full of them.
            </p>
            <p>
              We're here to <b>connect new parents in the neighborhood</b> for coffee, a playdate,
              or an understanding chat. We'll warmly introduce you to one person each month, sharing their name and contact
              along with local activities handpicked for your families.
            </p>
            <p>
              Postpartum Post was created for people who want to build connections — but <b>at the busy pace of early parenthood</b>.
              Subscriptions are flexible by design: skip any month, pause when life gets full, cancel anytime.
              In one click, you pick the topic, we find the match, and deliver the introduction in a delightful little letter to your inbox.
            </p>
          </div>
          <Link
            href="/"
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
