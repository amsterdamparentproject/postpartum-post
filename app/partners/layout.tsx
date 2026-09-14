import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";

const description =
  "Postpartum Post connects local Amsterdam businesses with new and expecting parents through Post Perks — a discount, freebie, or exclusive offer that makes shared parenthood just that little bit more joyful.";

export const metadata: Metadata = {
  title: "Partners",
  description,
  // Without this, sharing a /partners link showed the generic
  // member-facing site title/description from the root layout's
  // openGraph block instead of the partner pitch — same pattern as
  // app/privacy/page.tsx etc. Title is spelled out in full here (not
  // just "Partners") because, unlike the plain `title` field above,
  // openGraph.title does NOT get the root layout's "%s · Postpartum
  // Post" template applied — it renders exactly what's given.
  openGraph: {
    title: "Partners · Postpartum Post",
    description,
  },
};

/**
 * Applies to /partners and everything under it, including the public
 * splash — PageLayout (header/footer/page padding) belongs here rather
 * than the (app) route group's layout, since the splash needs it too but
 * must never load PartnerProvider (see that layout's docblock).
 */
export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout>
      <main className="flex-1 px-6 pt-8 pb-16 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </PageLayout>
  );
}
