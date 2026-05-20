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
      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 w-full">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="rounded-2xl overflow-hidden border border-border">
            <Image
              src="/logo.png"
              alt="About Postpartum Post"
              width={600}
              height={700}
              className="w-full h-full object-cover"
            />
          </div>

          <div>
            <h1
              className="text-4xl font-semibold text-dark mb-6 leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              About{" "}
              <span className="text-coral italic">Postpartum Post</span>
            </h1>
            <div className="space-y-4 text-muted leading-relaxed">
              <p>
                The postpartum period is one of the most transformative — and often loneliest — times in a parent's life. 
                Parent groups are great. But sometimes what you need is one person, not a room full of them.
              </p>
              <p>
                We match new parents in the same neighborhood for coffee, a playdate,
                or a supportive chat. One introduction a month, no commitment beyond showing up.
              </p>
              <p>
                Subscriptions are flexible by design: skip any month, pause when
                life gets full, cancel anytime. You pick the topic, we find the match — and deliver the introduction like a little letter in your inbox.
              </p>
            </div>
            <Link
              href="/"
              className="inline-block mt-8 py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
            >
              Sign up today
            </Link>
          </div>
        </div>
        {/* How matching works */}
        <div className="mt-20">
          <HowMatchingWorks />
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <FAQ />
        </div>
      </main>
    </PageLayout>
  );
}
