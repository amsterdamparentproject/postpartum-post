import SignupForm from "@/components/SignupForm";
import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
import PersonaCards from "@/components/PersonaCards";
import FAQ from "@/components/FAQ";
import { getStripe } from "@/lib/stripe";

const FIRST20_TOTAL = 20;

async function getFirst20SpotsRemaining(): Promise<number | null> {
  const couponId = process.env.STRIPE_FIRST20_COUPON_ID;
  if (!couponId) return null;
  try {
    const stripe = getStripe();
    const coupon = await stripe.coupons.retrieve(couponId);
    return Math.max(0, FIRST20_TOTAL - (coupon.times_redeemed ?? 0));
  } catch {
    return null;
  }
}


const PILOT_ONLY_UNTIL = new Date("2026-07-01");

export default async function Home() {
  const first20SpotsRemaining = await getFirst20SpotsRemaining();
  const pilotOnly = new Date() < PILOT_ONLY_UNTIL;

  return (
    <PageLayout showNav activeRoute="/">
      <main className="flex-1 flex flex-col items-center px-6 py-16">

        {/* Hero */}
        <div className="max-w-2xl w-full text-center mb-10">
          <h1
            className="text-5xl sm:text-6xl font-semibold leading-tight mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral italic">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </h1>
          <p className="text-xl text-dark font-medium leading-relaxed mb-3">
            Amsterdam is full of new parents just like you —{" "}
            <span className="text-coral italic">let us introduce you.</span>
          </p>
          <p className="text-base text-muted leading-relaxed max-w-lg mx-auto">
            Every month, we match you with another parent
            for coffee, a playdate, or just a chat. You receive a warm introduction, plus places and activities local to you and appropriate for your kids.
          </p>
        </div>

        {/* Persona cards */}
        <div className="w-full max-w-2xl mt-6 mb-12">
          <h2
            className="text-2xl font-semibold text-dark text-center mb-8"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            The Post was built for you
          </h2>
          <PersonaCards />
        </div>

        {/* Animated envelope */}
        <AnimatedMail />

        {/* Signup form */}
        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <h2
            className="text-xl font-semibold text-dark mb-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Receive your monthly Post 💌
          </h2>
          <p className="text-sm text-muted mb-6">
            Once you&apos;re subscribed, we&apos;ll get started finding you your first match!
          </p>
          <SignupForm first20SpotsRemaining={first20SpotsRemaining} pilotOnly={pilotOnly} />
        </div>

        {/* FAQ */}
        <div className="w-full max-w-2xl mt-16 mb-4">
          <FAQ />
        </div>

        {/* Attribution */}
        <p className="text-xs text-muted mt-8 mb-2 text-center">
          Run by{" "}
          <a
            href="https://amsterdamparentproject.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-coral transition-colors"
          >
            Alex from Amsterdam Parent Project
          </a>
        </p>

      </main>
    </PageLayout>
  );
}
