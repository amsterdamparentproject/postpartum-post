import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import EnvelopeLogo from "@/components/EnvelopeLogo";

export default async function ConsentConfirmed({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  const { invalid } = await searchParams;

  if (invalid) {
    return (
      <PageLayout>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="max-w-md w-full">
            <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
            <h1
              className="text-3xl text-dark mb-4"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              This link doesn&apos;t look right
            </h1>
            <p className="text-muted leading-relaxed mb-10">
              Please use the link from your email, or contact us at{" "}
              <a href="mailto:post@amsterdamparentproject.nl" className="underline">
                post@amsterdamparentproject.nl
              </a>{" "}
              if you need help.
            </p>
          </div>
        </main>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md w-full">
          <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
          <h1
            className="text-3xl text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            You&apos;re all set
          </h1>
          <p className="text-muted leading-relaxed mb-10">
            Thanks for confirming — all good here! We'll be in touch soon when the next match round opens.
          </p>
          <p className="text-muted leading-relaxed mb-10">
            In the meantime, check out the new profile & matching features we added so that we can match you with the best parent possible next month.
          </p>
          <Link
            href="/profile"
            className="py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Go to your profile
          </Link>
        </div>
      </main>
    </PageLayout>
  );
}
