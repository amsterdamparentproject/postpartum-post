import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export default function NotFound() {
  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-6xl mb-6">✉️</p>
        <h1
          className="text-4xl text-dark mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Lost in the post
        </h1>
        <p className="text-muted text-sm max-w-xs mb-8">
          This page doesn&apos;t exist or the link may have expired.
        </p>
        <Link
          href="/"
          className="text-sm text-coral hover:underline underline-offset-2 transition-colors"
        >
          Back to Postpartum Post
        </Link>
      </main>
    </PageLayout>
  );
}
