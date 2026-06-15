import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import SignupForm from "@/components/SignupForm";
import TextLogo from "@/components/TextLogo";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";
import type { SignupFormData } from "@/app/actions/signup";

export const metadata: Metadata = {
  title: "Claim Your Gift — Postpartum Post",
  robots: { index: false },
};

function giftMonthsToPlan(giftMonths: number): SignupFormData["plan"] | null {
  if (giftMonths === 3) return "commitment_3mo";
  if (giftMonths === 1) return "standard_monthly";
  return null;
}

export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { code } = await searchParams;
  const giftCode = typeof code === "string" ? code.toUpperCase() : null;

  let plan: SignupFormData["plan"] | null = null;
  let giftMonths: number | null = null;
  let errorMessage: string | null = null;

  if (!giftCode) {
    errorMessage = "This gift link is not valid. Check that you copied it correctly from your email.";
  } else {
    const supabase = createAdminClient();
    const { data: giftCard } = await supabase
      .from("gift_cards")
      .select("gift_months, redeemed_at")
      .eq("code", giftCode)
      .single();

    if (!giftCard) {
      errorMessage = "This gift card code is not valid. Check that you copied it correctly from your email.";
    } else if (giftCard.redeemed_at) {
      errorMessage = "This gift card has already been redeemed.";
    } else {
      giftMonths = giftCard.gift_months;
      plan = giftMonthsToPlan(giftCard.gift_months);
      if (!plan) {
        errorMessage = "Something went wrong with this gift card. Please contact us for help.";
      }
    }
  }

  const monthsText = giftMonths === 1 ? "1 month" : `${giftMonths} months`;

  return (
    <PageLayout showNav>
      <main className="flex-1 flex flex-col items-center px-6 pt-16 pb-12 md:pt-20 md:pb-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <EnvelopeLogo width={72} height={54} className="mx-auto mb-4" />
            <h1
              className="text-4xl text-dark mb-4 leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {errorMessage ? "Lost in the post..." : `You've been gifted ${monthsText} of`}
            </h1>
            {!errorMessage && (
              <TextLogo width={315} height={41} className="mx-auto mb-6" />
            )}
            {errorMessage ? (
              <>
                <p className="text-muted text-md leading-relaxed mt-2 mb-6">{errorMessage}</p>
                <Link
                  href="/"
                  className="inline-block py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
                >
                  Go to Postpartum Post
                </Link>
              </>
            ) : (
              <p className="text-dark text-md leading-relaxed">
                Every month, Postpartum Post matches new and expecting parents nearby — surrounding them in support when and where they need it most. Create your account below to claim your free {monthsText}.
              </p>
            )}
          </div>

          {!errorMessage && plan && giftCode && (
            <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
              <SignupForm lockedPlan={plan} giftCode={giftCode} />
            </div>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
