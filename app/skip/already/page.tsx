import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Already skipped",
  robots: { index: false },
};

export default async function SkipAlready({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <PageLayout showNav>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-md w-full space-y-6">

          {/* Confirmation */}
          <div className="space-y-3">
            <p className="text-4xl">👍</p>
            <h1
              className="text-3xl font-semibold text-dark leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Already sorted.
            </h1>
            <p className="text-base text-muted leading-relaxed">
              You&apos;ve already skipped this month — no need to do anything else.
              We&apos;ll see you next month.
            </p>
          </div>

          {/* Re-auth section */}
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-4 text-left">
            <p className="text-sm font-medium text-dark">Sign in to your account</p>
            <p className="text-xs text-muted leading-relaxed">
              Want to check your billing or update your details? Sign in below.
              {" "}If you&apos;re currently signed in as someone else,{" "}
              <SignOutButton className="text-coral underline underline-offset-2 hover:text-coral-dark transition-colors text-xs">
                sign out first
              </SignOutButton>
              .
            </p>
            <MagicLinkRequest defaultEmail={email} />
          </div>

        </div>
      </main>
    </PageLayout>
  );
}
