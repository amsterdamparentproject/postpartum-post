import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export default function UnsubscribeConfirmed() {
  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md w-full">
          <div className="text-5xl mb-6">🌿</div>
          <h1
            className="text-3xl font-semibold text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            You&apos;ve been unsubscribed
          </h1>
          <p className="text-muted leading-relaxed mb-8">
            Your subscription has been cancelled. You won't be charged again, and you won't receive any more matches.
          </p>
          <p className="text-muted text-sm leading-relaxed mb-10">
            We hope Postpartum Post was useful while it lasted. If you ever want to come back — whether your little one is 3 months or 3 years old — the door is always open.
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
