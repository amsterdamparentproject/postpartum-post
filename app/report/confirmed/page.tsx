import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import EnvelopeLogo from "@/components/EnvelopeLogo";

export default async function RematchConfirmed({
  searchParams,
}: {
  searchParams: Promise<{ credited?: string }>;
}) {
  const { credited } = await searchParams;
  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md w-full">
          <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
          <h1
            className="text-3xl text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Thanks for letting us know
          </h1>
          <p className="text-muted leading-relaxed mb-10">
            We&apos;ve received your report and ended this month&apos;s match.
            {credited === "1" && " We\u2019ve added one match back to your balance."}
            {" "}You can still use your Post Perks this month, and you&apos;ll be matched again next round.
          </p>
          <Link
            href="/"
            className="py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Back to home
          </Link>
        </div>
      </main>
    </PageLayout>
  );
}
