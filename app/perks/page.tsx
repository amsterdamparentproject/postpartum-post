import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import PerkIdeaForm from "@/components/PerkIdeaForm";

export const metadata: Metadata = {
  title: "Perks · Postpartum Post",
};

/**
 * Placeholder for the eventual public Post Perks page — mirrors
 * not-found.tsx's look on purpose (same emoji/serif-heading/muted-subtext
 * shape) since there's nothing to show here yet either. Linked from
 * PartnerGuide's "public Perks page" mention.
 */
export default function PerksPage() {
  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-6 py-24 text-center">
        <div>
          <p className="text-6xl mb-6">🎁</p>
          <h1
            className="text-4xl text-dark mb-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral">Post Perks</span> are in development!
          </h1>
          <p className="text-muted text-sm max-w-xs mx-auto">
            We&apos;re excited to launch Fall 2026.
          </p>
        </div>
        <PerkIdeaForm />
      </main>
    </PageLayout>
  );
}
