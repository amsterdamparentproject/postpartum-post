import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import EnvelopeLogo from "@/components/EnvelopeLogo";

export default function RematchConfirmed() {
  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md w-full">
          <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
          <h1
            className="text-3xl text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            We&apos;re on it
          </h1>
          <p className="text-muted leading-relaxed mb-10">
            Your rematch request has been noted. We&apos;ll find you a new match as soon as we can — keep an eye on your inbox.
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
