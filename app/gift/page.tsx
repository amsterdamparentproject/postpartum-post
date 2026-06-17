import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import GiftCardForm from "@/components/GiftCardForm";
import GiftBow from "@/components/GiftBow";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import TextLogo from "@/components/TextLogo";

export const metadata: Metadata = {
  title: "Gift Cards — Postpartum Post",
  description:
    "Give the gift of local parent friends when and where they need them most. Choose a 1- or 3-month Postpartum Post gift card.",
};

export default function GiftPage() {
  const links = {
    oneMonth: process.env.NEXT_PUBLIC_STRIPE_GIFT_CARD_1MO_LINK ?? "",
    threeMonth: process.env.NEXT_PUBLIC_STRIPE_GIFT_CARD_3MO_LINK ?? "",
  };

  return (
    <PageLayout showNav>
      <main className="flex-1 flex flex-col items-center px-6 pt-16 pb-12 md:pt-20 md:pb-16">
        <div className="relative w-full max-w-md">
          <div className="mb-8 text-center">
            <EnvelopeLogo width={72} height={54} className="mx-auto mb-4" />
            <h1
              className="text-4xl text-dark mb-6 leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Give the gift of <TextLogo width={315} height={41} className="inline-block align-middle" />
            </h1>

            <p className="text-dark text-md leading-relaxed mt-4 mb-16">
              Give the new or expecting parent in your life <b>connection, not clutter</b>. Every month, Postpartum Post matches parents nearby — surrounding them in support when and where they need it most.
            </p>
          </div>
          <div className="relative">
            <GiftBow className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[38%] w-40 h-auto z-10" />
            <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 pt-12">
              <GiftCardForm links={links} />
            </div>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
