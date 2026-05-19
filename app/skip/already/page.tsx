import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import SkipReAuthButton from "@/components/SkipReAuthButton";

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
        <div className="max-w-sm w-full space-y-6">
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
          {email && <SkipReAuthButton email={email} />}
        </div>
      </main>
    </PageLayout>
  );
}
