import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export default async function UnsubscribeConfirmed({
  searchParams,
}: {
  searchParams: Promise<{ matches?: string }>;
}) {
  const { matches } = await searchParams;
  const roundsLeft = Math.max(parseInt(matches ?? "0", 10) || 0, 0);

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md w-full">
          <div className="text-5xl mb-6">🌿</div>
          <h1
            className="text-3xl text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            You&apos;ve canceled your membership
          </h1>
          <p className="text-muted leading-relaxed mb-8">
            You&apos;ve canceled your membership to Postpartum Post — you won&apos;t be charged again.{" "}
            {roundsLeft > 0 ? (
              <>
                You opted to keep using your remaining{" "}
                <strong>
                  {roundsLeft} {roundsLeft === 1 ? "round" : "rounds"}
                </strong>
                , so you&apos;ll hear from us next month to join the round. If you wish to end everything, you can
                head back to Billing to change your preference at any time.
              </>
            ) : (
              "You won't get any more opt-in emails from us."
            )}
          </p>
          <Link
            href="/billing"
            className="py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Back to Billing
          </Link>
          <p className="text-muted leading-relaxed mt-10">
            We hope you found value in Postpartum Post! If you ever want to come back — whether your little one is 3 months or 3 years old — the door is always open.
          </p>
        </div>
      </main>
    </PageLayout>
  );
}
