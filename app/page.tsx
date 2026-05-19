import SignupForm from "@/components/SignupForm";
import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
import { SubscribeIcon, ChatBubbleIcon, LetterHeartIcon } from "@/components/StepIcons";
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


const HOW_IT_WORKS = [
  {
    icon: <SubscribeIcon />,
    title: "Subscribe",
    description: "Choose your plan and tell us your name. That's all we need to get started.",
  },
  {
    icon: <ChatBubbleIcon />,
    title: "Tell us about yourself",
    description: "A short form about your neighborhood, your little one, and when you're free.",
  },
  {
    icon: <LetterHeartIcon />,
    title: "Receive your Post",
    description: "Each month, we'll introduce you to a new parent nearby — by email, like a little letter.",
  },
];

export default async function Home() {
  const first20SpotsRemaining = await getFirst20SpotsRemaining();

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
            Every month, we match you with another new parent in your neighborhood
            for coffee, a playdate, or just a chat.
          </p>
        </div>

        {/* Animated envelope */}
        <AnimatedMail />

        {/* How it works */}
        <div className="w-full max-w-2xl mt-14 mb-12">
          <h2
            className="text-2xl font-semibold text-dark text-center mb-8"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map(({ icon, title, description }, i) => (
              <div key={i} className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 text-center">
                <div className="flex justify-center mb-3">{icon}</div>
                <h3 className="text-sm font-semibold text-dark mb-2">{title}</h3>
                <p className="text-xs text-muted leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

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
          <SignupForm first20SpotsRemaining={first20SpotsRemaining} />
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
