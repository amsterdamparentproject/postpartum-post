import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import HowMatchingWorks from "@/components/HowMatchingWorks";

export const metadata: Metadata = {
  title: "How matching works",
  description:
    "A step-by-step look at how Postpartum Post finds your monthly match — from your profile to your inbox.",
  openGraph: {
    title: "How matching works — Postpartum Post",
    description:
      "A step-by-step look at how Postpartum Post finds your monthly match — from your profile to your inbox.",
  },
};

export default function HowItWorksPage() {
  return (
    <PageLayout showNav activeRoute="/how-it-works">
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <HowMatchingWorks />
      </main>
    </PageLayout>
  );
}
