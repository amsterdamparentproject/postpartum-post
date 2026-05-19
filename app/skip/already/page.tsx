import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export const metadata: Metadata = {
  title: "Already skipped",
  robots: { index: false },
};

export default function SkipAlready() {
  return (
    <PageLayout showNav>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-md space-y-4">
          <p className="text-4xl">👍</p>
          <h1
            className="text-3xl font-semibold text-dark leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            You&apos;re already skipping this month.
          </h1>
          <p className="text-base text-muted leading-relaxed">
            Looks like you already clicked this link — no worries, everything is
            taken care of. We&apos;ll see you next month.
          </p>
          <div className="pt-4">
            <Link
              href="/billing"
              className="text-sm text-coral underline underline-offset-2 hover:text-coral-dark transition-colors"
            >
              View your billing details →
            </Link>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
