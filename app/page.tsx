import SignupForm from "@/components/SignupForm";
import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
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

export default async function Home() {
  const first20SpotsRemaining = await getFirst20SpotsRemaining();

  return (
    <PageLayout showNav activeRoute="/">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full text-center mb-10">
          <h1
            className="text-5xl sm:text-6xl font-semibold leading-tight mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral italic">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-lg mx-auto">
            A cozy community service pairing new parents in the neighborhood with coffee, playdates,
            and real support.
          </p>
        </div>

        <AnimatedMail />

        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 mt-6">
          <h2
            className="text-xl font-semibold text-dark mb-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Receive your monthly Post 💌
          </h2>
          <p className="text-sm text-muted mb-6">
            Once you're subscribed, we'll get started finding you your first match!
          </p>
          <SignupForm first20SpotsRemaining={first20SpotsRemaining} />
        </div>
      </main>
    </PageLayout>
  );
}
