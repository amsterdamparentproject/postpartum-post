import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gift Card Sent — Postpartum Post",
  robots: { index: false },
};

export default function GiftSuccessPage() {
  return (
    <PageLayout showNav>
      <main className="flex-1 flex flex-col items-center px-6 pt-16 pb-12 md:pt-20 md:pb-16">
        <div className="w-full max-w-md text-center">
          <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
          <h1
            className="text-3xl text-dark mb-2"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your gift card is on its way!
          </h1>
          <p className="text-muted text-md leading-relaxed mt-2 mb-6">
            Thanks for giving the gift of Postpartum Post to a parent in your life. The gift card code will arrive by email shortly — either to the recipient directly, or to you to pass along.
          </p>
          <Link
            href="/"
            className="inline-block py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition text-center"
          >
            Back to home
          </Link>
        </div>
      </main>
    </PageLayout>
  );
}
