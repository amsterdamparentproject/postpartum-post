import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
import PersonaCards from "@/components/PersonaCards";
import SubscribeSection from "@/components/SubscribeSection";
import Image from "next/image";
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


// Set to false to open general subscriptions (€8/mo and €12/mo plans)
const PILOT_ONLY = true;

export default async function Home() {
  const first20SpotsRemaining = await getFirst20SpotsRemaining();
  const pilotOnly = PILOT_ONLY;

  return (
    <PageLayout showNav activeRoute="/">
      <main className="flex-1 flex flex-col items-center px-6 px-6 md:py-16">

        {/* Hero */}
        <div className="max-w-2xl w-full text-center mb-10">
          <h1
            className="text-5xl hidden md:block font-semibold leading-tight text-center"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="block text-coral">Amsterdam is full of parents like you.</span>
            <span className="block text-dark">Let us introduce you.</span>
          </h1>
          <h1
            className="text-3xl max-w-lg mt-6 md:hidden font-semibold leading-tight text-center mx-auto"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral">Amsterdam is full of parents like you.</span>{" "}
            <span className="text-dark">Let us introduce you.</span>
          </h1>
          <p className="mt-6 text-base text-dark leading-relaxed max-w-lg mx-auto">
            Making one real parent friend beats being in ten group chats. Every month, we deliver you a curated friendship starter pack: a match with someone local who's navigating early parenthood like you, plus neighborhood activities handpicked for your families.
          </p>
        </div>

        {/* Persona cards */}
        <div className="w-full max-w-sm md:max-w-xl mt-2 md:mt-6 mb-12">
          <h2
            className="text-2xl font-semibold text-dark text-center mb-8"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            We made <span className="text-coral">Postpartum Post</span> for you
          </h2>
          <PersonaCards />
        </div>

        {/* Animated envelope */}
        <AnimatedMail />

        {/* Alex intro */}
        <div id="alex-intro" className="w-full max-w-md mt-12 mb-6 text-center">
          <h2
            className="text-2xl font-semibold text-dark text-center mx-auto"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Delivered with joy by someone who <span className="text-coral">gets it</span>
          </h2>
        </div>
        <div className="w-full max-w-lg mb-12 px-2 flex flex-col sm:flex-row items-center gap-6">
          <div
            className="shrink-0 overflow-hidden w-24 h-24"
            style={{ borderRadius: "62% 38% 46% 54% / 60% 44% 56% 40%" }}
          >
            <Image
              src="/alex.jpg"
              alt="Alex, founder of Postpartum Post"
              width={96}
              height={96}
              className="object-cover w-24 h-24"
            />
          </div>
          <div>
            <p className="text-sm text-dark leading-relaxed">
              Hi, I&apos;m Alex 👋🏻 I'm a local toddler mom and someone who knows exactly how isolating and overwhelming parenthood can feel. Becoming a mom abroad and dealing with burnout led me to start the{" "}
              <a
                href="https://amsterdamparentproject.nl"
                target="_blank"
                rel="noopener noreferrer"
                data-umami-event="Bio: Amsterdam Parent Project"
                className="underline underline-offset-2 hover:text-coral transition-colors"
              >
                Amsterdam Parent Project
              </a>
              {" "}— where I&apos;ve been running new parent support programs long enough to see that the right connection at the right time changes <i>everything</i> in parenthood. Postpartum Post is my way of making that easier to find.
            </p>
            {/* FAQ link */}
            <p className="text-xs text-muted mt-4 mb-2">
              Have questions?{" "}
              <a
                href="/about"
                className="underline underline-offset-2 hover:text-coral transition-colors"
              >
                Visit the About page
              </a>
            </p>
          </div>
        </div>

        {/* Signup form */}
        <div id="subscribe-form" className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <SubscribeSection first20SpotsRemaining={first20SpotsRemaining} pilotOnly={pilotOnly} />
        </div>

      </main>
    </PageLayout>
  );
}
